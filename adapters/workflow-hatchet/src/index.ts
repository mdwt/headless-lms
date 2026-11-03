import type {
  Logger,
  AutomationDispatch,
  AutomationExecutor,
  AutomationEngine,
  AutomationActionResult,
  DeliveryDispatch,
  ScheduledAutomation,
  JsonValue,
} from "@headless-lms/core/types";
import type { RecurringJob, ScheduledJob, Scheduler } from "@headless-lms/core/shared/ports";
import { APIContracts } from "@hatchet-dev/typescript-sdk/clients/rest/index.js";
import { ConcurrencyLimitStrategy, HatchetClient as Hatchet } from "@hatchet-dev/typescript-sdk/v1/index.js";
import {
  ACTION_FAILED,
  ActionFailedError,
  actionFailureMessage,
} from "@headless-lms/core/automations";

const WORKFLOW_NAME = "automation-run";
const ACTION_TASK_NAME = "automation-run-action";
const SCHEDULE_TASK_NAME = "automation-schedule";
const JOB_TASK_NAME = "scheduled-job";
const DELIVERY_TASK_NAME = "notification-delivery";
const WORKER_NAME = "automation-run-worker";
const CRON_PREFIX = "hlms-schedule:";
const JOB_CRON_PREFIX = "hlms-job:";
const RECONCILE_EVERY_MS = 5 * 60_000;
const ACTION_RETRIES = 3;
const JOB_RETRIES = 3;
const RETRY_BACKOFF = { factor: 5, maxSeconds: 300 };

interface ActionTaskInput {
  dispatch: AutomationDispatch;
  index: number;
}

interface ScheduleTaskInput {
  orgId: string;
  automationId: string;
}

interface JobTaskInput {
  job: string;
  key: string;
  payload: JsonValue;
}

interface TaskCtxLike {
  retryCount?(): number;
}

interface JobCtxLike {
  workflowRunId(): string;
}

interface DurableCtxLike {
  spawnChild(
    task: unknown,
    input: ActionTaskInput,
    options?: Record<string, unknown>,
  ): Promise<AutomationActionResult>;
}

interface RunnableTask<I> {
  runNoWait(input: I): Promise<unknown>;
}

interface HatchetWorkerLike {
  start(): Promise<void>;
  stop(): Promise<void>;
}

export interface HatchetCronLike {
  metadata: { id: string };
  name?: string;
  cron: string;
}

export interface HatchetCronClientLike {
  create(
    workflow: unknown,
    cron: { name: string; expression: string; input?: Record<string, unknown> },
  ): Promise<HatchetCronLike>;
  delete(cron: string | HatchetCronLike): Promise<void>;
  list(query: { workflow?: unknown; limit?: number; offset?: number }): Promise<{
    rows?: HatchetCronLike[];
  }>;
}

export interface HatchetScheduledRunLike {
  metadata: { id: string };
}

export interface HatchetScheduledClientLike {
  list(query: {
    workflow?: unknown;
    additionalMetadata?: string[];
    statuses?: APIContracts.ScheduledRunStatus[];
  }): Promise<{ rows?: HatchetScheduledRunLike[] }>;
  update(scheduledRun: string, update: { triggerAt: Date }): Promise<unknown>;
  bulkDelete(opts: {
    scheduledRuns?: string[];
    filter?: { additionalMetadata?: string[] };
  }): Promise<unknown>;
}

export interface HatchetTaskLike<I> {
  runNoWait(input: I): Promise<unknown>;
  schedule(
    enqueueAt: Date,
    input: I,
    options?: { additionalMetadata?: Record<string, string> },
  ): Promise<unknown>;
}

export interface HatchetClientLike {
  task<I>(opts: {
    name: string;
    retries?: number;
    backoff?: { factor?: number; maxSeconds?: number };
    concurrency?: {
      expression: string;
      maxRuns?: number;
      limitStrategy?: ConcurrencyLimitStrategy;
    };
    fn: (input: I, ctx: unknown) => Promise<unknown> | unknown;
  }): HatchetTaskLike<I>;
  durableTask(opts: {
    name: string;
    fn: (input: AutomationDispatch, ctx: DurableCtxLike) => Promise<void>;
  }): RunnableTask<AutomationDispatch>;
  worker(name: string, opts: { workflows: any[] }): Promise<HatchetWorkerLike>; // eslint-disable-line @typescript-eslint/no-explicit-any -- bridges to the SDK's own workflow union type without importing it
  crons: HatchetCronClientLike;
  scheduled: HatchetScheduledClientLike;
}

function floorMinute(at: Date): Date {
  const copy = new Date(at);
  copy.setUTCSeconds(0, 0);
  return copy;
}

export function cronName(schedule: ScheduledAutomation): string {
  return `${CRON_PREFIX}${schedule.orgId}:${schedule.automationId}:${schedule.cron}`;
}

function jobMetadata(job: string, key: string): { job: string; key: string } {
  return { job: encodeURIComponent(job), key: encodeURIComponent(key) };
}

function jobMetadataFilter(job: string, key: string): string[] {
  const metadata = jobMetadata(job, key);
  return [`job:${metadata.job}`, `key:${metadata.key}`];
}

export class HatchetAutomationEngine implements AutomationEngine, Scheduler {
  private executor: AutomationExecutor | undefined;
  private jobs = new Map<string, ScheduledJob>();
  private recurring: RecurringJob[] = [];
  private worker: HatchetWorkerLike | undefined;
  private syncing: Promise<void> | undefined;
  private syncingJobs: Promise<void> | undefined;
  private reconcileTimer: ReturnType<typeof setInterval> | undefined;
  private readonly actionTask: unknown;
  private readonly scheduleTask: unknown;
  private readonly jobTask: HatchetTaskLike<JobTaskInput>;
  private readonly deliveryTask: HatchetTaskLike<DeliveryDispatch>;
  private readonly automationRunTask: RunnableTask<AutomationDispatch>;

  constructor(
    private readonly client: HatchetClientLike = new Hatchet() as unknown as HatchetClientLike,
    private readonly logger?: Logger,
    private readonly reconcileEveryMs: number = RECONCILE_EVERY_MS,
  ) {
    this.actionTask = this.client.task<ActionTaskInput>({
      name: ACTION_TASK_NAME,
      retries: ACTION_RETRIES,
      fn: async (input, ctx) => this.runAction(input, ctx as TaskCtxLike | undefined),
    });

    this.scheduleTask = this.client.task<ScheduleTaskInput>({
      name: SCHEDULE_TASK_NAME,
      fn: async (input) => this.runSchedule(input),
    });

    this.jobTask = this.client.task<JobTaskInput>({
      name: JOB_TASK_NAME,
      retries: JOB_RETRIES,
      backoff: RETRY_BACKOFF,
      concurrency: {
        expression: "input.job + ':' + input.key",
        maxRuns: 1,
        limitStrategy: ConcurrencyLimitStrategy.GROUP_ROUND_ROBIN,
      },
      fn: async (input, ctx) => this.runJob(input, ctx as JobCtxLike),
    });

    this.deliveryTask = this.client.task<DeliveryDispatch>({
      name: DELIVERY_TASK_NAME,
      retries: ACTION_RETRIES,
      backoff: RETRY_BACKOFF,
      concurrency: {
        expression: "input.deliveryId",
        maxRuns: 1,
        limitStrategy: ConcurrencyLimitStrategy.GROUP_ROUND_ROBIN,
      },
      fn: async (input, ctx) => this.runDelivery(input, ctx as TaskCtxLike | undefined),
    });

    this.automationRunTask = this.client.durableTask({
      name: WORKFLOW_NAME,
      fn: async (dispatch, ctx) => this.runDispatch(dispatch, ctx),
    });
  }

  register(executor: AutomationExecutor): void {
    this.executor = executor;
  }

  registerJobs(handlers: ScheduledJob[], recurring: RecurringJob[]): void {
    this.jobs = new Map(handlers.map((handler) => [handler.job, handler]));
    this.recurring = [...recurring];
  }

  async at(job: string, runAt: Date, key: string, payload: JsonValue): Promise<void> {
    const [found, ...extra] = await this.pendingRuns(job, key);
    if (!found) {
      await this.scheduleJob(job, runAt, key, payload);
      return;
    }
    try {
      await this.client.scheduled.update(found.metadata.id, { triggerAt: runAt });
    } catch (err) {
      const pending = await this.pendingRuns(job, key);
      if (pending.some((run) => run.metadata.id === found.metadata.id)) {
        throw err;
      }
      await this.scheduleJob(job, runAt, key, payload);
    }
    if (extra.length > 0) {
      await this.client.scheduled.bulkDelete({
        scheduledRuns: extra.map((run) => run.metadata.id),
      });
    }
  }

  private async pendingRuns(job: string, key: string): Promise<HatchetScheduledRunLike[]> {
    const page = await this.client.scheduled.list({
      workflow: this.jobTask,
      additionalMetadata: jobMetadataFilter(job, key),
      statuses: [APIContracts.ScheduledRunStatus.SCHEDULED],
    });
    return page.rows ?? [];
  }

  private async scheduleJob(
    job: string,
    runAt: Date,
    key: string,
    payload: JsonValue,
  ): Promise<void> {
    await this.jobTask.schedule(
      runAt,
      { job, key, payload },
      { additionalMetadata: jobMetadata(job, key) },
    );
  }

  async cancel(job: string, key: string): Promise<void> {
    await this.client.scheduled.bulkDelete({
      filter: { additionalMetadata: jobMetadataFilter(job, key) },
    });
  }

  async dispatch(d: AutomationDispatch): Promise<void> {
    if (!this.executor) {
      throw new Error("HatchetAutomationEngine.dispatch called before register()");
    }
    await this.automationRunTask.runNoWait(d);
  }

  async deliver(d: DeliveryDispatch): Promise<void> {
    if (!this.executor) {
      throw new Error("HatchetAutomationEngine.deliver called before register()");
    }
    await this.deliveryTask.runNoWait(d);
  }

  async start(): Promise<void> {
    if (!this.executor) {
      throw new Error("HatchetAutomationEngine.start called before register()");
    }
    this.worker = await this.client.worker(WORKER_NAME, {
      workflows: [
        this.actionTask,
        this.automationRunTask,
        this.scheduleTask,
        this.jobTask,
        this.deliveryTask,
      ],
    });
    await this.reconcileJobsLogged();
    void this.worker.start().catch((err: unknown) => {
      this.logger?.error("hatchet worker stopped unexpectedly", { err });
    });
    if (this.reconcileTimer) {
      clearInterval(this.reconcileTimer);
    }
    this.reconcileTimer = setInterval(() => void this.reconcileAll(), this.reconcileEveryMs);
    this.reconcileTimer.unref?.();
    await this.syncLogged();
  }

  async stop(): Promise<void> {
    if (this.reconcileTimer) {
      clearInterval(this.reconcileTimer);
    }
    this.reconcileTimer = undefined;
    await this.worker?.stop();
    this.worker = undefined;
  }

  private async reconcileAll(): Promise<void> {
    await this.reconcileJobsLogged();
    await this.syncLogged();
  }

  private async reconcileJobsLogged(): Promise<void> {
    if (this.syncingJobs) {
      return this.syncingJobs;
    }
    this.syncingJobs = this.reconcileJobs()
      .catch((err: unknown) => {
        this.logger?.error("hatchet job crons not reconciled", { err });
      })
      .finally(() => {
        this.syncingJobs = undefined;
      });
    return this.syncingJobs;
  }

  private async syncLogged(): Promise<void> {
    try {
      await this.syncSchedules();
    } catch (err) {
      this.logger?.error("hatchet schedules not reconciled", { err });
    }
  }

  async syncSchedules(): Promise<void> {
    if (this.syncing) {
      await this.syncing;
      return this.syncSchedules();
    }
    this.syncing = this.reconcile().finally(() => {
      this.syncing = undefined;
    });
    await this.syncing;
  }

  private async reconcile(): Promise<void> {
    if (!this.executor?.listSchedules) {
      return;
    }
    const wanted = new Map<string, ScheduledAutomation>();
    for (const schedule of await this.executor.listSchedules()) {
      wanted.set(cronName(schedule), schedule);
    }
    const existing = await this.listCrons(this.scheduleTask);
    const seen = new Set<string>();
    for (const cron of existing) {
      if (!cron.name?.startsWith(CRON_PREFIX)) {
        continue;
      }
      const schedule = wanted.get(cron.name);
      if (schedule && schedule.cron === cron.cron && !seen.has(cron.name)) {
        seen.add(cron.name);
        continue;
      }
      await this.client.crons.delete(cron);
    }
    for (const [name, schedule] of wanted) {
      if (seen.has(name)) {
        continue;
      }
      await this.client.crons.create(this.scheduleTask, {
        name,
        expression: schedule.cron,
        input: { orgId: schedule.orgId, automationId: schedule.automationId },
      });
    }
    this.logger?.info("hatchet schedules synced", { count: wanted.size });
  }

  private async reconcileJobs(): Promise<void> {
    const wanted = new Map<string, RecurringJob>();
    for (const recurring of this.recurring) {
      wanted.set(`${JOB_CRON_PREFIX}${recurring.job}`, recurring);
    }
    const existing = await this.listCrons(this.jobTask);
    const seen = new Set<string>();
    for (const cron of existing) {
      if (!cron.name?.startsWith(JOB_CRON_PREFIX)) {
        continue;
      }
      const recurring = wanted.get(cron.name);
      if (recurring && recurring.cron === cron.cron && !seen.has(cron.name)) {
        seen.add(cron.name);
        continue;
      }
      await this.client.crons.delete(cron);
    }
    for (const [name, recurring] of wanted) {
      if (seen.has(name)) {
        continue;
      }
      await this.client.crons.create(this.jobTask, {
        name,
        expression: recurring.cron,
        input: { job: recurring.job, key: recurring.job, payload: null },
      });
    }
    this.logger?.info("hatchet job crons synced", { count: wanted.size });
  }

  private async runJob(input: JobTaskInput, ctx: JobCtxLike): Promise<void> {
    const handler = this.jobs.get(input.job);
    if (!handler) {
      this.logger?.error("scheduled job has no handler", { job: input.job, key: input.key });
      return;
    }
    await handler.run(input.payload, { id: ctx.workflowRunId(), startedAt: new Date() });
  }

  private async listCrons(workflow: unknown): Promise<HatchetCronLike[]> {
    const rows: HatchetCronLike[] = [];
    const limit = 100;
    for (let offset = 0; ; offset += limit) {
      const page = await this.client.crons.list({ workflow, limit, offset });
      const batch = page.rows ?? [];
      rows.push(...batch);
      if (batch.length < limit) {
        return rows;
      }
    }
  }

  private async runDelivery(input: DeliveryDispatch, ctx: TaskCtxLike | undefined): Promise<void> {
    if (!this.executor) {
      throw new Error("HatchetAutomationEngine: notification-delivery invoked before register()");
    }
    const lastAttempt = (ctx?.retryCount?.() ?? 0) >= ACTION_RETRIES;
    await this.executor.runDelivery(input, lastAttempt);
  }

  private async runSchedule(input: ScheduleTaskInput): Promise<void> {
    if (!this.executor?.fireSchedule) {
      throw new Error("HatchetAutomationEngine: automation-schedule invoked before register()");
    }
    await this.executor.fireSchedule(input.orgId, input.automationId, floorMinute(new Date()));
  }

  private async runAction(
    input: ActionTaskInput,
    ctx: TaskCtxLike | undefined,
  ): Promise<AutomationActionResult> {
    if (!this.executor) {
      throw new Error("HatchetAutomationEngine: automation-run-action invoked before register()");
    }
    const { dispatch, index } = input;
    try {
      return await this.executor.runAction(dispatch, index);
    } catch (err) {
      if ((ctx?.retryCount?.() ?? ACTION_RETRIES) < ACTION_RETRIES) {
        throw err;
      }
      if (!(err instanceof ActionFailedError)) {
        this.logActionError(dispatch, index, err);
      }
      return {
        index,
        type: dispatch.actions[index]!.type,
        status: "failed",
        error: actionFailureMessage(err),
      };
    }
  }

  private logActionError(dispatch: AutomationDispatch, index: number, err: unknown): void {
    this.logger?.error("automation action failed", {
      orgId: dispatch.orgId,
      automationId: dispatch.automationId,
      runId: dispatch.runId,
      index,
      err,
    });
  }

  private async runDispatch(dispatch: AutomationDispatch, ctx: DurableCtxLike): Promise<void> {
    if (!this.executor) {
      throw new Error("HatchetAutomationEngine: automation-run invoked before register()");
    }
    const executor = this.executor;

    const results: AutomationActionResult[] = [];
    for (let index = 0; index < dispatch.actions.length; index++) {
      let result: AutomationActionResult;
      try {
        result = await ctx.spawnChild(this.actionTask, { dispatch, index });
      } catch (err) {
        this.logActionError(dispatch, index, err);
        result = {
          index,
          type: dispatch.actions[index]!.type,
          status: "failed",
          error: ACTION_FAILED,
        };
      }
      results.push(result);
      if (result.status === "failed") {
        break;
      }
    }

    await executor.finalize(dispatch, results);
  }
}
