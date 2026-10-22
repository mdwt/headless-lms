import { describe, it, expect, vi } from "vitest";
import type { AutomationActionResult, AutomationDispatch, Logger } from "@headless-lms/core/types";
import { HatchetAutomationEngine, type HatchetClientLike } from "./index.js";

/** Records every `task`/`durableTask`/`worker` call the adapter makes and lets a
 *  test drive the captured task functions directly, as a real Hatchet worker
 *  would (minus the durable event log / retry machinery, which is Hatchet's job,
 *  not this adapter's — see the failing-child test for how that boundary is
 *  simulated instead). */
function fakeHatchetClient() {
  const runNoWait = vi.fn(async () => ({ workflowRunId: "run-123" }));
  const workerStart = vi.fn(async () => {});
  const workerStop = vi.fn(async () => {});

  let actionFn:
    | ((
        input: { dispatch: AutomationDispatch; index: number },
        ctx: unknown,
      ) => Promise<AutomationActionResult>)
    | undefined;
  let runDispatchFn: ((dispatch: AutomationDispatch, ctx: unknown) => Promise<void>) | undefined;
  let scheduleFn:
    | ((input: { orgId: string; automationId: string }, ctx: unknown) => Promise<unknown>)
    | undefined;
  let actionTaskHandle: unknown;

  const client: HatchetClientLike = {
    task: vi.fn((opts) => {
      if (opts.name === "automation-schedule") {
        scheduleFn = opts.fn as typeof scheduleFn;
        return { __task: opts.name };
      }
      actionFn = opts.fn as typeof actionFn;
      actionTaskHandle = { __task: opts.name };
      return actionTaskHandle;
    }),
    durableTask: vi.fn((opts) => {
      runDispatchFn = opts.fn;
      return { runNoWait };
    }),
    worker: vi.fn(async (_name, _opts) => ({ start: workerStart, stop: workerStop })),
    crons: {
      create: vi.fn(async (_workflow, cron) => ({
        metadata: { id: `cron-${cron.name}` },
        name: cron.name,
        cron: cron.expression,
      })),
      delete: vi.fn(async () => {}),
      list: vi.fn(async () => ({ rows: [] })),
    },
  };

  return {
    client,
    runNoWait,
    workerStart,
    workerStop,
    getActionTaskHandle: () => actionTaskHandle,
    callSchedule: (input: { orgId: string; automationId: string }) => {
      if (!scheduleFn) {
        throw new Error("schedule task not declared yet");
      }
      return scheduleFn(input, {});
    },
    callAction: (input: { dispatch: AutomationDispatch; index: number }) => {
      if (!actionFn) {
        throw new Error("action task not declared yet");
      }
      return actionFn(input, {});
    },
    callRunDispatch: (dispatch: AutomationDispatch, ctx: unknown) => {
      if (!runDispatchFn) {
        throw new Error("automation-run task not declared yet");
      }
      return runDispatchFn(dispatch, ctx);
    },
  };
}

function dispatch(): AutomationDispatch {
  return {
    runId: "run-1",
    orgId: "org-1",
    automationId: "automation-1",
    actions: [
      { type: "sendEmail", input: { template: "magicLink" } },
      { type: "sendEmail", input: { template: "magicLink" } },
    ],
    event: { type: "student.enrolled" } as AutomationDispatch["event"],
  };
}

describe("HatchetAutomationEngine", () => {
  it("declares the automation-run task and the automation-run-action task on construction", () => {
    const fake = fakeHatchetClient();
    // eslint-disable-next-line no-new -- constructing for its side effect of declaring tasks
    new HatchetAutomationEngine(fake.client);

    expect(fake.client.task).toHaveBeenCalledTimes(2);
    expect(fake.client.task).toHaveBeenCalledWith(
      expect.objectContaining({ name: "automation-run-action", retries: 3 }),
    );
    expect(fake.client.task).toHaveBeenCalledWith(
      expect.objectContaining({ name: "automation-schedule" }),
    );
    expect(fake.client.durableTask).toHaveBeenCalledTimes(1);
    expect(fake.client.durableTask).toHaveBeenCalledWith(
      expect.objectContaining({ name: "automation-run" }),
    );
  });

  it("throws when dispatch is called before register", async () => {
    const fake = fakeHatchetClient();
    const engine = new HatchetAutomationEngine(fake.client);
    await expect(engine.dispatch(dispatch())).rejects.toThrow();
    expect(fake.runNoWait).not.toHaveBeenCalled();
  });

  it("dispatch triggers a no-wait workflow run with the serialized dispatch as input", async () => {
    const fake = fakeHatchetClient();
    const engine = new HatchetAutomationEngine(fake.client);
    engine.register({ runAction: vi.fn(), finalize: vi.fn() });

    const d = dispatch();
    await engine.dispatch(d);

    expect(fake.runNoWait).toHaveBeenCalledTimes(1);
    expect(fake.runNoWait).toHaveBeenCalledWith(d);
  });

  it("the automation-run-action task calls executor.runAction with the dispatch and index", async () => {
    const fake = fakeHatchetClient();
    const engine = new HatchetAutomationEngine(fake.client);
    const runAction = vi.fn(async (): Promise<AutomationActionResult> => ({
      index: 0,
      type: "sendEmail",
      status: "completed",
    }));
    engine.register({ runAction, finalize: vi.fn() });

    const d = dispatch();
    const result = await fake.callAction({ dispatch: d, index: 1 });

    expect(runAction).toHaveBeenCalledWith(d, 1);
    expect(result).toEqual({ index: 0, type: "sendEmail", status: "completed" });
  });

  it("the automation-run task spawns one child per action in order and finalizes once", async () => {
    const fake = fakeHatchetClient();
    const engine = new HatchetAutomationEngine(fake.client);
    const results: AutomationActionResult[] = [
      { index: 0, type: "sendEmail", status: "completed" },
      { index: 1, type: "sendEmail", status: "completed" },
    ];
    const finalize = vi.fn(async () => {});
    engine.register({
      runAction: vi.fn(async (_d, index) => results[index]!),
      finalize,
    });

    const d = dispatch();
    const spawnOrder: number[] = [];
    const ctx = {
      spawnChild: vi.fn(
        async (task: unknown, input: { dispatch: AutomationDispatch; index: number }) => {
          expect(task).toBe(fake.getActionTaskHandle());
          spawnOrder.push(input.index);
          return fake.callAction(input);
        },
      ),
    };

    await fake.callRunDispatch(d, ctx);

    expect(spawnOrder).toEqual([0, 1]);
    expect(ctx.spawnChild).toHaveBeenCalledTimes(2);
    expect(finalize).toHaveBeenCalledTimes(1);
    expect(finalize).toHaveBeenCalledWith(d, results);
  });

  it("stops the sequence and finalizes with a failed result when a child exhausts its retries", async () => {
    const fake = fakeHatchetClient();
    const engine = new HatchetAutomationEngine(fake.client);
    const finalize = vi.fn(async () => {});
    engine.register({
      runAction: vi.fn(),
      finalize,
    });

    const d: AutomationDispatch = {
      ...dispatch(),
      actions: [
        { type: "sendEmail", input: { template: "magicLink" } },
        { type: "sendEmail", input: { template: "magicLink" } },
        { type: "sendEmail", input: { template: "magicLink" } },
      ],
    };
    const ctx = {
      spawnChild: vi.fn(
        async (_task: unknown, input: { dispatch: AutomationDispatch; index: number }) => {
          if (input.index === 0) {
            return { index: 0, type: "sendEmail", status: "completed" } as AutomationActionResult;
          }
          // Simulates Hatchet exhausting the child task's retries: 3 and the
          // parent's spawnChild ultimately rejecting.
          throw new Error("boom");
        },
      ),
    };

    await fake.callRunDispatch(d, ctx);

    expect(ctx.spawnChild).toHaveBeenCalledTimes(2);
    expect(finalize).toHaveBeenCalledTimes(1);
    expect(finalize).toHaveBeenCalledWith(d, [
      { index: 0, type: "sendEmail", status: "completed" },
      { index: 1, type: "sendEmail", status: "failed", error: "boom" },
    ]);
  });

  it("start creates and starts a worker registered with both tasks, without blocking on worker.start()", async () => {
    const fake = fakeHatchetClient();
    const engine = new HatchetAutomationEngine(fake.client);
    engine.register({ runAction: vi.fn(), finalize: vi.fn() });

    await engine.start();

    expect(fake.client.worker).toHaveBeenCalledTimes(1);
    const [name, opts] = (fake.client.worker as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(name).toBe("automation-run-worker");
    expect(opts.workflows).toHaveLength(3);
    expect(fake.workerStart).toHaveBeenCalledTimes(1);
  });

  it("throws when start is called before register", async () => {
    const fake = fakeHatchetClient();
    const engine = new HatchetAutomationEngine(fake.client);
    await expect(engine.start()).rejects.toThrow();
    expect(fake.client.worker).not.toHaveBeenCalled();
  });

  it("stop stops the worker", async () => {
    const fake = fakeHatchetClient();
    const engine = new HatchetAutomationEngine(fake.client);
    engine.register({ runAction: vi.fn(), finalize: vi.fn() });
    await engine.start();

    await engine.stop();

    expect(fake.workerStop).toHaveBeenCalledTimes(1);
  });

  it("registers one cron per schedule on start and removes crons that no longer match", async () => {
    const fake = fakeHatchetClient();
    (fake.client.crons.list as ReturnType<typeof vi.fn>).mockResolvedValue({
      rows: [
        {
          metadata: { id: "keep" },
          name: "hlms-schedule:org-1:atm_1:0 * * * *",
          cron: "0 * * * *",
        },
        {
          metadata: { id: "stale" },
          name: "hlms-schedule:org-1:atm_9:0 7 * * *",
          cron: "0 7 * * *",
        },
        { metadata: { id: "foreign" }, name: "someone-else", cron: "* * * * *" },
      ],
    });
    const engine = new HatchetAutomationEngine(fake.client);
    const fireSchedule = vi.fn();
    engine.register({
      runAction: vi.fn(),
      finalize: vi.fn(),
      listSchedules: async () => [
        { orgId: "org-1", automationId: "atm_1", cron: "0 * * * *" },
        { orgId: "org-1", automationId: "atm_2", cron: "* * * * *" },
      ],
      fireSchedule,
    });

    await engine.start();

    expect(fake.client.crons.delete).toHaveBeenCalledTimes(1);
    expect(fake.client.crons.delete).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { id: "stale" } }),
    );
    expect(fake.client.crons.create).toHaveBeenCalledTimes(1);
    expect(fake.client.crons.create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        name: "hlms-schedule:org-1:atm_2:* * * * *",
        expression: "* * * * *",
        input: { orgId: "org-1", automationId: "atm_2" },
      }),
    );
  });

  it("the automation-schedule task fires the schedule at the current minute", async () => {
    const fake = fakeHatchetClient();
    const engine = new HatchetAutomationEngine(fake.client);
    const fireSchedule = vi.fn();
    engine.register({ runAction: vi.fn(), finalize: vi.fn(), fireSchedule });

    await fake.callSchedule({ orgId: "org-1", automationId: "atm_2" });

    expect(fireSchedule).toHaveBeenCalledTimes(1);
    const [orgId, automationId, firedAt] = fireSchedule.mock.calls[0]!;
    expect(orgId).toBe("org-1");
    expect(automationId).toBe("atm_2");
    expect((firedAt as Date).getUTCSeconds()).toBe(0);
  });

  it("starts when Hatchet refuses the reconcile, logs it, and reconciles again on the interval", async () => {
    vi.useFakeTimers();
    const fake = fakeHatchetClient();
    const list = fake.client.crons.list as ReturnType<typeof vi.fn>;
    list.mockRejectedValueOnce(new Error("hatchet down"));
    const error = vi.fn();
    const logger: Logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error,
      child: () => logger,
    };
    const engine = new HatchetAutomationEngine(fake.client, logger, 1000);
    engine.register({
      runAction: vi.fn(),
      finalize: vi.fn(),
      listSchedules: async () => [{ orgId: "org-1", automationId: "atm_2", cron: "* * * * *" }],
      fireSchedule: vi.fn(),
    });

    await expect(engine.start()).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith("hatchet schedules not reconciled", {
      error: "Error: hatchet down",
    });
    expect(fake.client.crons.create).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);
    expect(fake.client.crons.create).toHaveBeenCalledTimes(1);

    await engine.stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(list).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("stop before start is a safe no-op", async () => {
    const fake = fakeHatchetClient();
    const engine = new HatchetAutomationEngine(fake.client);
    await expect(engine.stop()).resolves.toBeUndefined();
    expect(fake.workerStop).not.toHaveBeenCalled();
  });
});
