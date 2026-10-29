import type {
  Logger,
  AutomationDispatch,
  AutomationExecutor,
  AutomationEngine,
  AutomationActionResult,
  ScheduledAutomation,
} from "@headless-lms/core/types";
import { Hatchet } from "@hatchet-dev/typescript-sdk";

const WORKFLOW_NAME = "automation-run";
const ACTION_TASK_NAME = "automation-run-action";
const SCHEDULE_TASK_NAME = "automation-schedule";
const WORKER_NAME = "automation-run-worker";
const CRON_PREFIX = "hlms-schedule:";
const RECONCILE_EVERY_MS = 5 * 60_000;

interface ActionTaskInput {
  dispatch: AutomationDispatch;
  index: number;
}

interface ScheduleTaskInput {
  orgId: string;
  automationId: string;
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

export interface HatchetClientLike {
  task<I>(opts: {
    name: string;
    retries?: number;
    fn: (input: I, ctx: unknown) => Promise<unknown> | unknown;
  }): unknown;
  durableTask(opts: {
    name: string;
    fn: (input: AutomationDispatch, ctx: DurableCtxLike) => Promise<void>;
  }): RunnableTask<AutomationDispatch>;
  worker(name: string, opts: { workflows: any[] }): Promise<HatchetWorkerLike>; // eslint-disable-line @typescript-eslint/no-explicit-any -- bridges to the SDK's own workflow union type without importing it
  crons: HatchetCronClientLike;
}

function floorMinute(at: Date): Date {
  const copy = new Date(at);
  copy.setUTCSeconds(0, 0);
  return copy;
}

export function cronName(schedule: ScheduledAutomation): string {
  return `${CRON_PREFIX}${schedule.orgId}:${schedule.automationId}:${schedule.cron}`;
}

export class HatchetAutomationEngine implements AutomationEngine {
  private executor: AutomationExecutor | undefined;
  private worker: HatchetWorkerLike | undefined;
  private syncing: Promise<void> | undefined;
  private reconcileTimer: ReturnType<typeof setInterval> | undefined;
  private readonly actionTask: unknown;
  private readonly scheduleTask: unknown;
  private readonly automationRunTask: RunnableTask<AutomationDispatch>;

  constructor(
    private readonly client: HatchetClientLike = new Hatchet() as unknown as HatchetClientLike,
    private readonly logger?: Logger,
    private readonly reconcileEveryMs: number = RECONCILE_EVERY_MS,
  ) {
    this.actionTask = this.client.task<ActionTaskInput>({
      name: ACTION_TASK_NAME,
      retries: 3,
      fn: async (input) => this.runAction(input),
    });

    this.scheduleTask = this.client.task<ScheduleTaskInput>({
      name: SCHEDULE_TASK_NAME,
      fn: async (input) => this.runSchedule(input),
    });

    this.automationRunTask = this.client.durableTask({
      name: WORKFLOW_NAME,
      fn: async (dispatch, ctx) => this.runDispatch(dispatch, ctx),
    });
  }

  register(executor: AutomationExecutor): void {
    this.executor = executor;
  }

  async dispatch(d: AutomationDispatch): Promise<void> {
    if (!this.executor) {
      throw new Error("HatchetAutomationEngine.dispatch called before register()");
    }
    await this.automationRunTask.runNoWait(d);
  }

  async start(): Promise<void> {
    if (!this.executor) {
      throw new Error("HatchetAutomationEngine.start called before register()");
    }
    this.worker = await this.client.worker(WORKER_NAME, {
      workflows: [this.actionTask, this.automationRunTask, this.scheduleTask],
    });
    void this.worker.start().catch((err: unknown) => {
      this.logger?.error("hatchet worker stopped unexpectedly", { err });
    });
    if (this.reconcileTimer) {
      clearInterval(this.reconcileTimer);
    }
    this.reconcileTimer = setInterval(() => void this.syncLogged(), this.reconcileEveryMs);
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
    const existing = await this.listCrons();
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

  private async listCrons(): Promise<HatchetCronLike[]> {
    const rows: HatchetCronLike[] = [];
    const limit = 100;
    for (let offset = 0; ; offset += limit) {
      const page = await this.client.crons.list({ workflow: this.scheduleTask, limit, offset });
      const batch = page.rows ?? [];
      rows.push(...batch);
      if (batch.length < limit) {
        return rows;
      }
    }
  }

  private async runSchedule(input: ScheduleTaskInput): Promise<void> {
    if (!this.executor?.fireSchedule) {
      throw new Error("HatchetAutomationEngine: automation-schedule invoked before register()");
    }
    await this.executor.fireSchedule(input.orgId, input.automationId, floorMinute(new Date()));
  }

  private async runAction(input: ActionTaskInput): Promise<AutomationActionResult> {
    if (!this.executor) {
      throw new Error("HatchetAutomationEngine: automation-run-action invoked before register()");
    }
    return this.executor.runAction(input.dispatch, input.index);
  }

  private async runDispatch(dispatch: AutomationDispatch, ctx: DurableCtxLike): Promise<void> {
    if (!this.executor) {
      throw new Error("HatchetAutomationEngine: automation-run invoked before register()");
    }
    const executor = this.executor;

    const results: AutomationActionResult[] = [];
    for (let index = 0; index < dispatch.actions.length; index++) {
      try {
        results.push(await ctx.spawnChild(this.actionTask, { dispatch, index }));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        results.push({
          index,
          type: dispatch.actions[index]!.type,
          status: "failed",
          error: message,
        });
        break;
      }
    }

    await executor.finalize(dispatch, results);
  }
}
