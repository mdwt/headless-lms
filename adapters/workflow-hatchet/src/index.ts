// Hatchet implementation of the AutomationEngine port — durable execution via
// hatchet.run. One workflow ("automation-run") is a durable parent task that
// iterates the dispatched actions, spawning one child task ("automation-run-action",
// retries: 3) per action through the durable event log. A child that exhausts its
// retries stops the sequence; the parent then finalizes once with the results
// collected so far. Because the parent is a *durable* task and children are spawned
// via `ctx.spawnChild` (the durable event log), a crash mid-run replays completed
// child calls from the log instead of re-running them — resuming after the last
// completed action rather than restarting the whole sequence.
import type { Logger, AutomationDispatch, AutomationExecutor, AutomationEngine, AutomationActionResult } from "@headless-lms/types";
import { Hatchet } from "@hatchet-dev/typescript-sdk";

const WORKFLOW_NAME = "automation-run";
const ACTION_TASK_NAME = "automation-run-action";
const WORKER_NAME = "automation-run-worker";

/** Input to the per-action child task. */
interface ActionTaskInput {
  dispatch: AutomationDispatch;
  index: number;
}

/** The subset of `DurableContext` the parent task uses. Hand-rolled (rather than
 *  importing the SDK's `DurableContext`) so a plain fake object can satisfy it in
 *  tests without constructing a real Hatchet client. */
interface DurableCtxLike {
  spawnChild(task: unknown, input: ActionTaskInput, options?: Record<string, unknown>): Promise<AutomationActionResult>;
}

/** A declared task/workflow handle that can be triggered directly. */
interface RunnableTask<I> {
  runNoWait(input: I): Promise<unknown>;
}

interface HatchetWorkerLike {
  start(): Promise<void>;
  stop(): Promise<void>;
}

/** The subset of the Hatchet v1 client this adapter calls. Hand-rolled (rather
 *  than typing the constructor parameter as `Hatchet` itself) so tests can inject
 *  a fake client — a real `Hatchet` instance satisfies this structurally. */
export interface HatchetClientLike {
  task(opts: {
    name: string;
    retries?: number;
    fn: (input: ActionTaskInput, ctx: unknown) => Promise<AutomationActionResult> | AutomationActionResult;
  }): unknown;
  durableTask(opts: {
    name: string;
    fn: (input: AutomationDispatch, ctx: DurableCtxLike) => Promise<void>;
  }): RunnableTask<AutomationDispatch>;
  worker(name: string, opts: { workflows: any[] }): Promise<HatchetWorkerLike>; // eslint-disable-line @typescript-eslint/no-explicit-any -- bridges to the SDK's own workflow union type without importing it
}

export class HatchetAutomationEngine implements AutomationEngine {
  private executor: AutomationExecutor | undefined;
  private worker: HatchetWorkerLike | undefined;
  private readonly actionTask: unknown;
  private readonly automationRunTask: RunnableTask<AutomationDispatch>;

  /** `client` defaults to a Hatchet client constructed from env (incl.
   *  `HATCHET_CLIENT_TOKEN` — the SDK reads its own env). Pass a fake for tests. */
  constructor(
    private readonly client: HatchetClientLike = new Hatchet(),
    private readonly logger?: Logger,
  ) {
    this.actionTask = this.client.task({
      name: ACTION_TASK_NAME,
      retries: 3,
      fn: async (input) => this.runAction(input),
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
      workflows: [this.actionTask, this.automationRunTask],
    });
    // worker.start() resolves only once the worker stops — run it in the
    // background and surface unexpected failures via the logger.
    void this.worker.start().catch((err: unknown) => {
      this.logger?.error("hatchet worker stopped unexpectedly", { error: String(err) });
    });
  }

  async stop(): Promise<void> {
    await this.worker?.stop();
    this.worker = undefined;
  }

  /** The child task body: run one action, letting failures throw so Hatchet's
   *  per-task retry (retries: 3) applies before the parent gives up on it. */
  private async runAction(input: ActionTaskInput): Promise<AutomationActionResult> {
    if (!this.executor) {
      throw new Error("HatchetAutomationEngine: automation-run-action invoked before register()");
    }
    return this.executor.runAction(input.dispatch, input.index);
  }

  /** The durable parent task body: sequentially spawn one child per action
   *  through the durable event log, stop on the first exhausted child, and
   *  finalize exactly once with the results collected so far. */
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
        results.push({ index, type: dispatch.actions[index]!.type, status: "failed", error: message });
        break;
      }
    }

    // A crash between finalize's commit and this parent task completing
    // replays finalize on resume (the durable event log restarts the task,
    // not just the un-logged tail) — finalize, and anything downstream of the
    // run.completed/run.failed events it appends, must tolerate duplicates.
    await executor.finalize(dispatch, results);
  }
}
