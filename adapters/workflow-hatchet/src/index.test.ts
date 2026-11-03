import { describe, it, expect, vi } from "vitest";
import { APIContracts, ConcurrencyLimitStrategy } from "@hatchet-dev/typescript-sdk";
import type { AutomationActionResult, AutomationDispatch, Logger } from "@headless-lms/core/types";
import { ActionFailedError } from "@headless-lms/core/automations";
import { createCapturingLogger } from "@headless-lms/core/shared/logger";
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
  let jobFn:
    | ((
        input: { job: string; key: string; payload: unknown },
        ctx: { workflowRunId(): string },
      ) => Promise<unknown>)
    | undefined;
  let deliveryFn:
    ((input: { orgId: string; deliveryId: string }, ctx: unknown) => Promise<unknown>) | undefined;
  let actionTaskHandle: unknown;
  let jobTaskHandle: unknown;
  const deliveryRunNoWait = vi.fn(async () => ({ workflowRunId: "delivery-run" }));
  const schedule = vi.fn(async () => ({ metadata: { id: "scheduled-new" } }));

  const client: HatchetClientLike = {
    task: vi.fn((opts) => {
      if (opts.name === "automation-schedule") {
        scheduleFn = opts.fn as typeof scheduleFn;
        return { __task: opts.name, schedule: vi.fn(), runNoWait: vi.fn() };
      }
      if (opts.name === "notification-delivery") {
        deliveryFn = opts.fn as typeof deliveryFn;
        return {
          __task: opts.name,
          schedule: vi.fn(),
          runNoWait: deliveryRunNoWait,
        } as ReturnType<HatchetClientLike["task"]>;
      }
      if (opts.name === "scheduled-job") {
        jobFn = opts.fn as typeof jobFn;
        jobTaskHandle = { __task: opts.name, schedule, runNoWait: vi.fn() };
        return jobTaskHandle as ReturnType<HatchetClientLike["task"]>;
      }
      actionFn = opts.fn as typeof actionFn;
      actionTaskHandle = { __task: opts.name, schedule: vi.fn(), runNoWait: vi.fn() };
      return actionTaskHandle as ReturnType<HatchetClientLike["task"]>;
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
    scheduled: {
      list: vi.fn(async () => ({ rows: [] })),
      update: vi.fn(async () => ({})),
      bulkDelete: vi.fn(async () => ({ deletedIds: [], errors: [] })),
    },
  };

  return {
    client,
    runNoWait,
    workerStart,
    workerStop,
    schedule,
    deliveryRunNoWait,
    callDelivery: (input: { orgId: string; deliveryId: string }, retryCount = 0) => {
      if (!deliveryFn) {
        throw new Error("notification-delivery task not declared yet");
      }
      return deliveryFn(input, { retryCount: () => retryCount });
    },
    getActionTaskHandle: () => actionTaskHandle,
    getJobTaskHandle: () => jobTaskHandle,
    callJob: (input: { job: string; key: string; payload: unknown }, runId = "wfr-1") => {
      if (!jobFn) {
        throw new Error("scheduled-job task not declared yet");
      }
      return jobFn(input, { workflowRunId: () => runId });
    },
    callSchedule: (input: { orgId: string; automationId: string }) => {
      if (!scheduleFn) {
        throw new Error("schedule task not declared yet");
      }
      return scheduleFn(input, {});
    },
    callAction: (input: { dispatch: AutomationDispatch; index: number }, retryCount = 0) => {
      if (!actionFn) {
        throw new Error("action task not declared yet");
      }
      return actionFn(input, { retryCount: () => retryCount });
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

    expect(fake.client.task).toHaveBeenCalledTimes(4);
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

  it("rethrows an action error for Hatchet to retry until the last attempt", async () => {
    const fake = fakeHatchetClient();
    const engine = new HatchetAutomationEngine(fake.client);
    engine.register({
      runAction: vi.fn(async () => {
        throw new ActionFailedError("deliverWebhook: endpoint responded 500");
      }),
      finalize: vi.fn(),
    });
    const d = dispatch();

    await expect(fake.callAction({ dispatch: d, index: 1 }, 2)).rejects.toThrow(
      "deliverWebhook: endpoint responded 500",
    );
    await expect(fake.callAction({ dispatch: d, index: 1 }, 3)).resolves.toEqual({
      index: 1,
      type: "sendEmail",
      status: "failed",
      error: "deliverWebhook: endpoint responded 500",
    });
  });

  it("records a generic message for an unclassified error on the last attempt and logs it", async () => {
    const fake = fakeHatchetClient();
    const { logger, entries } = createCapturingLogger();
    const engine = new HatchetAutomationEngine(fake.client, logger);
    const err = new Error('relation "automation_runs" violates constraint "x_fkey"');
    engine.register({
      runAction: vi.fn(async () => {
        throw err;
      }),
      finalize: vi.fn(),
    });
    const d = dispatch();

    await expect(fake.callAction({ dispatch: d, index: 0 }, 3)).resolves.toEqual({
      index: 0,
      type: "sendEmail",
      status: "failed",
      error: "The action failed",
    });
    expect(entries).toContainEqual({
      level: "error",
      msg: "automation action failed",
      meta: { orgId: "org-1", automationId: "automation-1", runId: "run-1", index: 0, err },
    });
  });

  it("stops the sequence at a failed child result", async () => {
    const fake = fakeHatchetClient();
    const engine = new HatchetAutomationEngine(fake.client);
    const finalize = vi.fn(async () => {});
    engine.register({ runAction: vi.fn(), finalize });
    const failed: AutomationActionResult = {
      index: 0,
      type: "sendEmail",
      status: "failed",
      error: "deliverWebhook: endpoint responded 500",
    };
    const ctx = { spawnChild: vi.fn(async () => failed) };
    const d = dispatch();

    await fake.callRunDispatch(d, ctx);

    expect(ctx.spawnChild).toHaveBeenCalledTimes(1);
    expect(finalize).toHaveBeenCalledWith(d, [failed]);
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
      { index: 1, type: "sendEmail", status: "failed", error: "The action failed" },
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
    expect(opts.workflows).toHaveLength(5);
    expect(opts.workflows).toContain(fake.getJobTaskHandle());
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
    let scheduleLists = 0;
    list.mockImplementation(async (query: { workflow: unknown }) => {
      if (query.workflow === fake.getJobTaskHandle()) {
        return { rows: [] };
      }
      scheduleLists++;
      if (scheduleLists === 1) {
        throw new Error("hatchet down");
      }
      return { rows: [] };
    });
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
      err: expect.objectContaining({ message: "hatchet down" }),
    });
    expect(fake.client.crons.create).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);
    expect(fake.client.crons.create).toHaveBeenCalledTimes(1);

    await engine.stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(scheduleLists).toBe(2);
    vi.useRealTimers();
  });

  it("stop before start is a safe no-op", async () => {
    const fake = fakeHatchetClient();
    const engine = new HatchetAutomationEngine(fake.client);
    await expect(engine.stop()).resolves.toBeUndefined();
    expect(fake.workerStop).not.toHaveBeenCalled();
  });
});

describe("HatchetAutomationEngine as Scheduler", () => {
  it("declares the scheduled-job task with three retries backing off 5s, 25s, 125s and one run per job and key", () => {
    const fake = fakeHatchetClient();
    // eslint-disable-next-line no-new -- constructing for its side effect of declaring tasks
    new HatchetAutomationEngine(fake.client);

    expect(fake.client.task).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "scheduled-job",
        retries: 3,
        backoff: { factor: 5, maxSeconds: 300 },
        concurrency: {
          expression: "input.job + ':' + input.key",
          maxRuns: 1,
          limitStrategy: ConcurrencyLimitStrategy.GROUP_ROUND_ROBIN,
        },
      }),
    );
  });

  it("at schedules a new run with the job and key as metadata when none is pending", async () => {
    const fake = fakeHatchetClient();
    const engine = new HatchetAutomationEngine(fake.client);
    const runAt = new Date("2026-11-03T10:05:00.000Z");

    await engine.at("discussion.post.publish", runAt, "pst_1", { orgId: "org_1", postId: "pst_1" });

    expect(fake.client.scheduled.list).toHaveBeenCalledWith({
      workflow: fake.getJobTaskHandle(),
      additionalMetadata: ["job:discussion.post.publish", "key:pst_1"],
      statuses: [APIContracts.ScheduledRunStatus.SCHEDULED],
    });
    expect(fake.schedule).toHaveBeenCalledWith(
      runAt,
      {
        job: "discussion.post.publish",
        key: "pst_1",
        payload: { orgId: "org_1", postId: "pst_1" },
      },
      { additionalMetadata: { job: "discussion.post.publish", key: "pst_1" } },
    );
    expect(fake.client.scheduled.update).not.toHaveBeenCalled();
  });

  it("at moves the pending run of the same job and key instead of adding one", async () => {
    const fake = fakeHatchetClient();
    (fake.client.scheduled.list as ReturnType<typeof vi.fn>).mockResolvedValue({
      rows: [{ metadata: { id: "scheduled-1" } }],
    });
    const engine = new HatchetAutomationEngine(fake.client);
    const runAt = new Date("2026-11-03T10:07:00.000Z");

    await engine.at("automations.notifications.flush", runAt, "usr_1:cht_1", { chatId: "cht_1" });

    expect(fake.client.scheduled.update).toHaveBeenCalledWith("scheduled-1", { triggerAt: runAt });
    expect(fake.client.scheduled.bulkDelete).not.toHaveBeenCalled();
    expect(fake.schedule).not.toHaveBeenCalled();
  });

  it("at moves the first pending run and deletes the others of the same job and key", async () => {
    const fake = fakeHatchetClient();
    (fake.client.scheduled.list as ReturnType<typeof vi.fn>).mockResolvedValue({
      rows: [
        { metadata: { id: "scheduled-1" } },
        { metadata: { id: "scheduled-2" } },
        { metadata: { id: "scheduled-3" } },
      ],
    });
    const engine = new HatchetAutomationEngine(fake.client);
    const runAt = new Date("2026-11-03T10:07:00.000Z");

    await engine.at("discussion.post.publish", runAt, "pst_1", { orgId: "org_1", postId: "pst_1" });

    expect(fake.client.scheduled.update).toHaveBeenCalledTimes(1);
    expect(fake.client.scheduled.update).toHaveBeenCalledWith("scheduled-1", { triggerAt: runAt });
    expect(fake.client.scheduled.bulkDelete).toHaveBeenCalledWith({
      scheduledRuns: ["scheduled-2", "scheduled-3"],
    });
    expect(fake.schedule).not.toHaveBeenCalled();
  });

  it("at schedules a new run when the pending run fires before it can be moved", async () => {
    const fake = fakeHatchetClient();
    (fake.client.scheduled.list as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ rows: [{ metadata: { id: "scheduled-1" } }] })
      .mockResolvedValueOnce({ rows: [] });
    (fake.client.scheduled.update as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('[{"description":"Scheduled workflow not found."}]'),
    );
    const engine = new HatchetAutomationEngine(fake.client);
    const runAt = new Date("2026-11-03T10:07:00.000Z");

    await engine.at("automations.notifications.flush", runAt, "usr_1:cht_1", { chatId: "cht_1" });

    expect(fake.client.scheduled.update).toHaveBeenCalledWith("scheduled-1", { triggerAt: runAt });
    expect(fake.schedule).toHaveBeenCalledWith(
      runAt,
      { job: "automations.notifications.flush", key: "usr_1:cht_1", payload: { chatId: "cht_1" } },
      { additionalMetadata: { job: "automations.notifications.flush", key: "usr_1%3Acht_1" } },
    );
  });

  it("at fails when the move is refused and the run is still pending", async () => {
    const fake = fakeHatchetClient();
    (fake.client.scheduled.list as ReturnType<typeof vi.fn>).mockResolvedValue({
      rows: [{ metadata: { id: "scheduled-1" } }],
    });
    (fake.client.scheduled.update as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("hatchet down"),
    );
    const engine = new HatchetAutomationEngine(fake.client);

    await expect(
      engine.at("discussion.post.publish", new Date(), "pst_1", { postId: "pst_1" }),
    ).rejects.toThrow("hatchet down");
    expect(fake.schedule).not.toHaveBeenCalled();
  });

  it("at encodes a key holding colons in the metadata and its filter, and keeps it raw in the input", async () => {
    const fake = fakeHatchetClient();
    const engine = new HatchetAutomationEngine(fake.client);
    const runAt = new Date("2026-11-03T10:07:00.000Z");

    await engine.at("automations.notifications.flush", runAt, "usr_1:cht_1", { chatId: "cht_1" });

    expect(fake.client.scheduled.list).toHaveBeenCalledWith({
      workflow: fake.getJobTaskHandle(),
      additionalMetadata: ["job:automations.notifications.flush", "key:usr_1%3Acht_1"],
      statuses: [APIContracts.ScheduledRunStatus.SCHEDULED],
    });
    expect(fake.schedule).toHaveBeenCalledWith(
      runAt,
      { job: "automations.notifications.flush", key: "usr_1:cht_1", payload: { chatId: "cht_1" } },
      { additionalMetadata: { job: "automations.notifications.flush", key: "usr_1%3Acht_1" } },
    );
  });

  it("at fails when Hatchet refuses the lookup", async () => {
    const fake = fakeHatchetClient();
    (fake.client.scheduled.list as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("workflow not found"),
    );
    const engine = new HatchetAutomationEngine(fake.client);

    await expect(engine.at("discussion.post.publish", new Date(), "pst_1", null)).rejects.toThrow(
      "workflow not found",
    );
    expect(fake.schedule).not.toHaveBeenCalled();
  });

  it("cancel bulk-deletes the scheduled runs of the job and key", async () => {
    const fake = fakeHatchetClient();
    const engine = new HatchetAutomationEngine(fake.client);

    await engine.cancel("automations.notifications.flush", "usr_1:cht_1");

    expect(fake.client.scheduled.bulkDelete).toHaveBeenCalledWith({
      filter: { additionalMetadata: ["job:automations.notifications.flush", "key:usr_1%3Acht_1"] },
    });
  });

  it("the scheduled-job task calls the registered handler with the payload and the fire", async () => {
    const fake = fakeHatchetClient();
    const engine = new HatchetAutomationEngine(fake.client);
    const run = vi.fn(async () => {});
    engine.registerJobs([{ job: "discussion.post.publish", run }], []);

    await fake.callJob(
      { job: "discussion.post.publish", key: "pst_1", payload: { postId: "pst_1" } },
      "wfr-9",
    );

    expect(run).toHaveBeenCalledTimes(1);
    const [payload, fire] = run.mock.calls[0]! as unknown as [
      unknown,
      { id: string; startedAt: Date },
    ];
    expect(payload).toEqual({ postId: "pst_1" });
    expect(fire.id).toBe("wfr-9");
    expect(fire.startedAt).toBeInstanceOf(Date);
  });

  it("the scheduled-job task rethrows a handler error so Hatchet retries", async () => {
    const fake = fakeHatchetClient();
    const engine = new HatchetAutomationEngine(fake.client);
    engine.registerJobs(
      [
        {
          job: "discussion.post.publish",
          run: vi.fn(async () => {
            throw new Error("db down");
          }),
        },
      ],
      [],
    );

    await expect(
      fake.callJob({ job: "discussion.post.publish", key: "pst_1", payload: null }),
    ).rejects.toThrow("db down");
  });

  it("the scheduled-job task logs and drops a job with no handler", async () => {
    const fake = fakeHatchetClient();
    const { logger, entries } = createCapturingLogger();
    const engine = new HatchetAutomationEngine(fake.client, logger);
    engine.registerJobs([], []);

    await expect(
      fake.callJob({ job: "unknown.job", key: "k", payload: null }),
    ).resolves.toBeUndefined();
    expect(entries).toContainEqual({
      level: "error",
      msg: "scheduled job has no handler",
      meta: { job: "unknown.job", key: "k" },
    });
  });

  it("start registers the worker, then reconciles the job crons, then starts the worker", async () => {
    const fake = fakeHatchetClient();
    const order: string[] = [];
    (fake.client.worker as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      order.push("worker");
      return {
        start: vi.fn(async () => {
          order.push("start");
        }),
        stop: vi.fn(async () => {}),
      };
    });
    (fake.client.crons.list as ReturnType<typeof vi.fn>).mockImplementation(
      async (query: { workflow: unknown }) => {
        order.push(query.workflow === fake.getJobTaskHandle() ? "list jobs" : "list schedules");
        if (query.workflow !== fake.getJobTaskHandle()) {
          return { rows: [] };
        }
        return {
          rows: [
            {
              metadata: { id: "keep" },
              name: "hlms-job:entitlements.grants.expire",
              cron: "0 * * * *",
            },
            {
              metadata: { id: "copy" },
              name: "hlms-job:entitlements.grants.expire",
              cron: "0 * * * *",
            },
            {
              metadata: { id: "changed" },
              name: "hlms-job:discussion.digest.open",
              cron: "5 * * * *",
            },
            { metadata: { id: "gone" }, name: "hlms-job:retired.job", cron: "0 0 * * *" },
            { metadata: { id: "foreign" }, name: "someone-else", cron: "* * * * *" },
          ],
        };
      },
    );
    const engine = new HatchetAutomationEngine(fake.client);
    engine.register({ runAction: vi.fn(), finalize: vi.fn() });
    engine.registerJobs(
      [],
      [
        { job: "entitlements.grants.expire", cron: "0 * * * *" },
        { job: "discussion.digest.open", cron: "0 * * * *" },
        { job: "assets.uploads.removeUnattached", cron: "30 * * * *" },
      ],
    );

    await engine.start();

    expect(order.slice(0, 3)).toEqual(["worker", "list jobs", "start"]);
    const deleted = (fake.client.crons.delete as ReturnType<typeof vi.fn>).mock.calls.map(
      ([cron]) => (cron as { metadata: { id: string } }).metadata.id,
    );
    expect(deleted).toEqual(["copy", "changed", "gone"]);
    expect(fake.client.crons.create).toHaveBeenCalledTimes(2);
    expect(fake.client.crons.create).toHaveBeenCalledWith(fake.getJobTaskHandle(), {
      name: "hlms-job:discussion.digest.open",
      expression: "0 * * * *",
      input: { job: "discussion.digest.open", key: "discussion.digest.open", payload: null },
    });
    expect(fake.client.crons.create).toHaveBeenCalledWith(fake.getJobTaskHandle(), {
      name: "hlms-job:assets.uploads.removeUnattached",
      expression: "30 * * * *",
      input: {
        job: "assets.uploads.removeUnattached",
        key: "assets.uploads.removeUnattached",
        payload: null,
      },
    });
    await engine.stop();
  });

  it("start removes every job cron when no recurring job is registered", async () => {
    const fake = fakeHatchetClient();
    (fake.client.crons.list as ReturnType<typeof vi.fn>).mockImplementation(
      async (query: { workflow: unknown }) =>
        query.workflow === fake.getJobTaskHandle()
          ? { rows: [{ metadata: { id: "old" }, name: "hlms-job:old", cron: "0 * * * *" }] }
          : { rows: [] },
    );
    const engine = new HatchetAutomationEngine(fake.client);
    engine.register({ runAction: vi.fn(), finalize: vi.fn() });
    engine.registerJobs([], []);

    await engine.start();

    expect(fake.client.crons.delete).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { id: "old" } }),
    );
    expect(fake.client.crons.create).not.toHaveBeenCalled();
    await engine.stop();
  });

  it("start logs a failed job cron reconcile and still starts the worker", async () => {
    const fake = fakeHatchetClient();
    (fake.client.crons.list as ReturnType<typeof vi.fn>).mockImplementation(
      async (query: { workflow: unknown }) => {
        if (query.workflow === fake.getJobTaskHandle()) {
          throw new Error("hatchet down");
        }
        return { rows: [] };
      },
    );
    const { logger, entries } = createCapturingLogger();
    const engine = new HatchetAutomationEngine(fake.client, logger);
    engine.register({ runAction: vi.fn(), finalize: vi.fn() });
    engine.registerJobs([], [{ job: "entitlements.grants.expire", cron: "0 * * * *" }]);

    await expect(engine.start()).resolves.toBeUndefined();

    expect(fake.workerStart).toHaveBeenCalledTimes(1);
    expect(entries).toContainEqual({
      level: "error",
      msg: "hatchet job crons not reconciled",
      meta: { err: expect.objectContaining({ message: "hatchet down" }) },
    });
    await engine.stop();
  });

  it("reconciles the job crons again on the interval after a failed start", async () => {
    vi.useFakeTimers();
    const fake = fakeHatchetClient();
    let jobLists = 0;
    (fake.client.crons.list as ReturnType<typeof vi.fn>).mockImplementation(
      async (query: { workflow: unknown }) => {
        if (query.workflow !== fake.getJobTaskHandle()) {
          return { rows: [] };
        }
        jobLists++;
        if (jobLists === 1) {
          throw new Error("hatchet down");
        }
        return { rows: [] };
      },
    );
    const engine = new HatchetAutomationEngine(fake.client, undefined, 1000);
    engine.register({ runAction: vi.fn(), finalize: vi.fn() });
    engine.registerJobs([], [{ job: "entitlements.grants.expire", cron: "0 * * * *" }]);

    await engine.start();
    expect(fake.client.crons.create).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);
    expect(fake.client.crons.create).toHaveBeenCalledTimes(1);
    expect(fake.client.crons.create).toHaveBeenCalledWith(fake.getJobTaskHandle(), {
      name: "hlms-job:entitlements.grants.expire",
      expression: "0 * * * *",
      input: {
        job: "entitlements.grants.expire",
        key: "entitlements.grants.expire",
        payload: null,
      },
    });

    await engine.stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(jobLists).toBe(2);
    vi.useRealTimers();
  });
});

describe("HatchetAutomationEngine deliveries", () => {
  it("declares the notification-delivery task with the action retries backing off 5s, 25s, 125s and one run per delivery", () => {
    const fake = fakeHatchetClient();
    // eslint-disable-next-line no-new -- constructing for its side effect of declaring tasks
    new HatchetAutomationEngine(fake.client);
    expect(fake.client.task).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "notification-delivery",
        retries: 3,
        backoff: { factor: 5, maxSeconds: 300 },
        concurrency: {
          expression: "input.deliveryId",
          maxRuns: 1,
          limitStrategy: ConcurrencyLimitStrategy.GROUP_ROUND_ROBIN,
        },
      }),
    );
  });

  it("deliver enqueues one task run for the delivery", async () => {
    const fake = fakeHatchetClient();
    const engine = new HatchetAutomationEngine(fake.client);
    engine.register({ runAction: vi.fn(), finalize: vi.fn(), runDelivery: vi.fn() });
    await engine.deliver({ orgId: "org-1", deliveryId: "ndl_1" });
    expect(fake.deliveryRunNoWait).toHaveBeenCalledWith({ orgId: "org-1", deliveryId: "ndl_1" });
  });

  it("deliver refuses before register", async () => {
    const fake = fakeHatchetClient();
    const engine = new HatchetAutomationEngine(fake.client);
    await expect(engine.deliver({ orgId: "org-1", deliveryId: "ndl_1" })).rejects.toThrow(
      "before register()",
    );
    expect(fake.deliveryRunNoWait).not.toHaveBeenCalled();
  });

  it("runs the delivery as its last attempt only on the final retry", async () => {
    const fake = fakeHatchetClient();
    const engine = new HatchetAutomationEngine(fake.client);
    const runDelivery = vi.fn(async () => {});
    engine.register({ runAction: vi.fn(), finalize: vi.fn(), runDelivery });
    const input = { orgId: "org-1", deliveryId: "ndl_1" };
    await fake.callDelivery(input, 0);
    await fake.callDelivery(input, 2);
    await fake.callDelivery(input, 3);
    expect(runDelivery.mock.calls).toEqual([
      [input, false],
      [input, false],
      [input, true],
    ]);
  });

  it("lets a thrown delivery error reach Hatchet so it retries", async () => {
    const fake = fakeHatchetClient();
    const engine = new HatchetAutomationEngine(fake.client);
    const error = new Error("smtp 451");
    engine.register({
      runAction: vi.fn(),
      finalize: vi.fn(),
      runDelivery: vi.fn(async () => {
        throw error;
      }),
    });
    await expect(fake.callDelivery({ orgId: "org-1", deliveryId: "ndl_1" }, 1)).rejects.toBe(error);
  });
});
