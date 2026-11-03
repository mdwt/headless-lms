// Default in-process engine — runs a dispatched automation immediately, one
// attempt per action; durable engines (Hatchet, …) are installation adapters.
import type {
  AutomationActionResult,
  AutomationDispatch,
  AutomationEngine,
  AutomationExecutor,
  JsonValue,
  Logger,
} from "@headless-lms/core/types";
import type { RecurringJob, ScheduledJob, Scheduler } from "@headless-lms/core/shared/ports";
import { ActionFailedError, actionFailureMessage } from "@headless-lms/core/automations";
import { startScheduleLoop } from "./schedule.js";
import { InlineJobs } from "./jobs.js";

export { startScheduleLoop };

export class InlineAutomationEngine implements AutomationEngine, Scheduler {
  private executor: AutomationExecutor | undefined;
  private schedule: { stop(): void } | undefined;
  private readonly jobs: InlineJobs;

  constructor(private readonly logger?: Logger) {
    this.jobs = new InlineJobs(logger);
  }

  register(executor: AutomationExecutor): void {
    this.executor = executor;
  }

  registerJobs(handlers: ScheduledJob[], recurring: RecurringJob[]): void {
    this.jobs.register(handlers, recurring);
  }

  async at(job: string, runAt: Date, key: string, payload: JsonValue): Promise<void> {
    this.jobs.at(job, runAt, key, payload);
  }

  async cancel(job: string, key: string): Promise<void> {
    this.jobs.cancel(job, key);
  }

  async dispatch(d: AutomationDispatch): Promise<void> {
    if (!this.executor) {
      throw new Error("InlineAutomationEngine.dispatch called before register()");
    }
    const executor = this.executor;

    const results: AutomationActionResult[] = [];
    for (let index = 0; index < d.actions.length; index++) {
      try {
        results.push(await executor.runAction(d, index));
      } catch (err) {
        if (!(err instanceof ActionFailedError)) {
          this.logger?.error("automation action failed", {
            orgId: d.orgId,
            automationId: d.automationId,
            runId: d.runId,
            index,
            err,
          });
        }
        results.push({
          index,
          type: d.actions[index]!.type,
          status: "failed",
          error: actionFailureMessage(err),
        });
        break;
      }
    }

    await executor.finalize(d, results);
  }

  async start(): Promise<void> {
    this.schedule?.stop();
    this.schedule = startScheduleLoop(() => this.executor, this.logger);
    this.jobs.start();
  }

  async stop(): Promise<void> {
    this.schedule?.stop();
    this.schedule = undefined;
    this.jobs.stop();
  }
}
