import { describe, it, expect, vi } from "vitest";
import type { AutomationActionResult, AutomationDispatch } from "@headless-lms/types";
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

  let actionFn: ((input: { dispatch: AutomationDispatch; index: number }, ctx: unknown) => Promise<AutomationActionResult>) | undefined;
  let runDispatchFn: ((dispatch: AutomationDispatch, ctx: unknown) => Promise<void>) | undefined;
  let actionTaskHandle: unknown;

  const client: HatchetClientLike = {
    task: vi.fn((opts) => {
      actionFn = opts.fn as typeof actionFn;
      actionTaskHandle = { __task: opts.name };
      return actionTaskHandle;
    }),
    durableTask: vi.fn((opts) => {
      runDispatchFn = opts.fn;
      return { runNoWait };
    }),
    worker: vi.fn(async (_name, _opts) => ({ start: workerStart, stop: workerStop })),
  };

  return {
    client,
    runNoWait,
    workerStart,
    workerStop,
    getActionTaskHandle: () => actionTaskHandle,
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
      { type: "sendEmail", template: "magicLink" },
      { type: "sendEmail", template: "magicLink" },
    ],
    event: { type: "student.enrolled" } as AutomationDispatch["event"],
  };
}

describe("HatchetAutomationEngine", () => {
  it("declares the automation-run task and the automation-run-action task on construction", () => {
    const fake = fakeHatchetClient();
    // eslint-disable-next-line no-new -- constructing for its side effect of declaring tasks
    new HatchetAutomationEngine(fake.client);

    expect(fake.client.task).toHaveBeenCalledTimes(1);
    expect(fake.client.task).toHaveBeenCalledWith(
      expect.objectContaining({ name: "automation-run-action", retries: 3 }),
    );
    expect(fake.client.durableTask).toHaveBeenCalledTimes(1);
    expect(fake.client.durableTask).toHaveBeenCalledWith(expect.objectContaining({ name: "automation-run" }));
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
      spawnChild: vi.fn(async (task: unknown, input: { dispatch: AutomationDispatch; index: number }) => {
        expect(task).toBe(fake.getActionTaskHandle());
        spawnOrder.push(input.index);
        return fake.callAction(input);
      }),
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
        { type: "sendEmail", template: "magicLink" },
        { type: "sendEmail", template: "magicLink" },
        { type: "sendEmail", template: "magicLink" },
      ],
    };
    const ctx = {
      spawnChild: vi.fn(async (_task: unknown, input: { dispatch: AutomationDispatch; index: number }) => {
        if (input.index === 0) {
          return { index: 0, type: "sendEmail", status: "completed" } as AutomationActionResult;
        }
        // Simulates Hatchet exhausting the child task's retries: 3 and the
        // parent's spawnChild ultimately rejecting.
        throw new Error("boom");
      }),
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
    expect(opts.workflows).toHaveLength(2);
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

  it("stop before start is a safe no-op", async () => {
    const fake = fakeHatchetClient();
    const engine = new HatchetAutomationEngine(fake.client);
    await expect(engine.stop()).resolves.toBeUndefined();
    expect(fake.workerStop).not.toHaveBeenCalled();
  });
});
