import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ScheduledJob } from "@headless-lms/core/shared/ports";
import { createCapturingLogger } from "@headless-lms/core/shared/logger";
import { InlineAutomationEngine } from "./index.js";

function handler(job: string): ScheduledJob & { run: ReturnType<typeof vi.fn> } {
  return { job, run: vi.fn(async () => {}) };
}

describe("InlineAutomationEngine as Scheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-03T10:00:30.000Z"));
  });

  afterEach(async () => {
    vi.useRealTimers();
  });

  it("runs a job once at its time with the payload and a fire id", async () => {
    const engine = new InlineAutomationEngine();
    const publish = handler("discussion.post.publish");
    engine.registerJobs([publish], []);

    await engine.at("discussion.post.publish", new Date("2026-11-03T10:05:00.000Z"), "pst_1", {
      orgId: "org_1",
      postId: "pst_1",
    });

    await vi.advanceTimersByTimeAsync(4 * 60_000);
    expect(publish.run).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(30_000);
    expect(publish.run).toHaveBeenCalledTimes(1);
    const [payload, fire] = publish.run.mock.calls[0]!;
    expect(payload).toEqual({ orgId: "org_1", postId: "pst_1" });
    expect(typeof fire.id).toBe("string");
    expect(fire.startedAt).toEqual(new Date("2026-11-03T10:05:00.000Z"));

    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(publish.run).toHaveBeenCalledTimes(1);
  });

  it("runs a job whose time has passed at once", async () => {
    const engine = new InlineAutomationEngine();
    const publish = handler("discussion.post.publish");
    engine.registerJobs([publish], []);

    await engine.at("discussion.post.publish", new Date("2026-11-03T09:00:00.000Z"), "pst_1", null);
    await vi.advanceTimersByTimeAsync(0);

    expect(publish.run).toHaveBeenCalledTimes(1);
  });

  it("replaces a pending job with a second at for the same job and key", async () => {
    const engine = new InlineAutomationEngine();
    const flush = handler("automations.notifications.flush");
    engine.registerJobs([flush], []);

    await engine.at(
      "automations.notifications.flush",
      new Date("2026-11-03T10:02:00.000Z"),
      "usr_1:cht_1",
      { count: 1 },
    );
    await engine.at(
      "automations.notifications.flush",
      new Date("2026-11-03T10:03:00.000Z"),
      "usr_1:cht_1",
      { count: 2 },
    );

    await vi.advanceTimersByTimeAsync(2 * 60_000);
    expect(flush.run).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(60_000);
    expect(flush.run).toHaveBeenCalledTimes(1);
    expect(flush.run.mock.calls[0]![0]).toEqual({ count: 2 });
  });

  it("keeps jobs with different keys apart", async () => {
    const engine = new InlineAutomationEngine();
    const publish = handler("discussion.post.publish");
    engine.registerJobs([publish], []);

    await engine.at("discussion.post.publish", new Date("2026-11-03T10:01:00.000Z"), "pst_1", 1);
    await engine.at("discussion.post.publish", new Date("2026-11-03T10:01:00.000Z"), "pst_2", 2);
    await vi.advanceTimersByTimeAsync(60_000);

    expect(publish.run.mock.calls.map((call) => call[0])).toEqual([1, 2]);
  });

  it("cancel removes a pending job, and does nothing for an unknown one", async () => {
    const engine = new InlineAutomationEngine();
    const publish = handler("discussion.post.publish");
    engine.registerJobs([publish], []);

    await engine.at("discussion.post.publish", new Date("2026-11-03T10:01:00.000Z"), "pst_1", null);
    await engine.cancel("discussion.post.publish", "pst_1");
    await expect(engine.cancel("discussion.post.publish", "pst_9")).resolves.toBeUndefined();
    await vi.advanceTimersByTimeAsync(5 * 60_000);

    expect(publish.run).not.toHaveBeenCalled();
  });

  it("waits past the longest timer for a job far ahead", async () => {
    const engine = new InlineAutomationEngine();
    const publish = handler("discussion.post.publish");
    engine.registerJobs([publish], []);

    await engine.at("discussion.post.publish", new Date("2026-12-31T10:00:30.000Z"), "pst_1", null);
    await vi.advanceTimersByTimeAsync(30 * 24 * 60 * 60_000);
    expect(publish.run).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(28 * 24 * 60 * 60_000);
    expect(publish.run).toHaveBeenCalledTimes(1);
  });

  it("logs and drops a job with no handler", async () => {
    const { logger, entries } = createCapturingLogger();
    const engine = new InlineAutomationEngine(logger);
    engine.registerJobs([], []);

    await engine.at("unknown.job", new Date("2026-11-03T10:01:00.000Z"), "k", null);
    await vi.advanceTimersByTimeAsync(60_000);

    expect(entries).toContainEqual({
      level: "error",
      msg: "scheduled job has no handler",
      meta: { job: "unknown.job", key: "k" },
    });
  });

  it("logs a handler that throws and runs it once", async () => {
    const { logger, entries } = createCapturingLogger();
    const engine = new InlineAutomationEngine(logger);
    const err = new Error("boom");
    const failing: ScheduledJob = {
      job: "discussion.post.publish",
      run: vi.fn(async () => {
        throw err;
      }),
    };
    engine.registerJobs([failing], []);

    await engine.at("discussion.post.publish", new Date("2026-11-03T10:01:00.000Z"), "pst_1", null);
    await vi.advanceTimersByTimeAsync(10 * 60_000);

    expect(failing.run).toHaveBeenCalledTimes(1);
    expect(entries).toContainEqual({
      level: "error",
      msg: "scheduled job failed",
      meta: { job: "discussion.post.publish", key: "pst_1", err },
    });
  });

  it("stop clears pending jobs", async () => {
    const engine = new InlineAutomationEngine();
    const publish = handler("discussion.post.publish");
    engine.registerJobs([publish], []);

    await engine.at("discussion.post.publish", new Date("2026-11-03T10:01:00.000Z"), "pst_1", null);
    await engine.stop();
    await vi.advanceTimersByTimeAsync(5 * 60_000);

    expect(publish.run).not.toHaveBeenCalled();
  });

  it("runs recurring jobs on their cron after start, with the job as key and a null payload", async () => {
    vi.setSystemTime(new Date("2026-11-03T10:05:30.000Z"));
    const engine = new InlineAutomationEngine();
    const expire = handler("entitlements.grants.expire");
    const sweep = handler("assets.uploads.removeUnattached");
    engine.registerJobs(
      [expire, sweep],
      [
        { job: "entitlements.grants.expire", cron: "0 * * * *" },
        { job: "assets.uploads.removeUnattached", cron: "30 10 * * *" },
      ],
    );

    await engine.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(expire.run).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(60 * 60_000);
    expect(expire.run).toHaveBeenCalledTimes(1);
    expect(expire.run.mock.calls[0]![0]).toBeNull();
    expect(expire.run.mock.calls[0]![1].startedAt).toEqual(new Date("2026-11-03T11:00:30.000Z"));
    expect(sweep.run.mock.calls[0]![1].startedAt).toEqual(new Date("2026-11-03T10:30:30.000Z"));
    expect(sweep.run).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(60 * 60_000);
    expect(expire.run).toHaveBeenCalledTimes(2);
    expect(sweep.run).toHaveBeenCalledTimes(1);

    await engine.stop();
    await vi.advanceTimersByTimeAsync(2 * 60 * 60_000);
    expect(expire.run).toHaveBeenCalledTimes(2);
  });

  it("runs a recurring job on the first tick when the current minute matches, once per minute", async () => {
    vi.setSystemTime(new Date("2026-11-03T11:00:10.000Z"));
    const engine = new InlineAutomationEngine();
    const expire = handler("entitlements.grants.expire");
    engine.registerJobs([expire], [{ job: "entitlements.grants.expire", cron: "0 * * * *" }]);

    await engine.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(expire.run).toHaveBeenCalledTimes(1);

    await engine.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(expire.run).toHaveBeenCalledTimes(1);
    await engine.stop();
  });
});
