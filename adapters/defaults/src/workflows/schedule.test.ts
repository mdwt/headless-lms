import { describe, expect, it, vi } from "vitest";
import type { AutomationExecutor } from "@headless-lms/core/types";
import { createCapturingLogger } from "@headless-lms/core/shared/logger";
import { fireDueSchedules } from "./schedule.js";

describe("fireDueSchedules", () => {
  const schedule = { orgId: "org-1", automationId: "atm_1", cron: "0 7 * * *" };

  function executor(fireSchedule: AutomationExecutor["fireSchedule"]): AutomationExecutor {
    return {
      listSchedules: async () => [schedule],
      fireSchedule,
      runAction: vi.fn(),
      finalize: vi.fn(),
    };
  }

  it("fires a minute the previous tick skipped", async () => {
    const fireSchedule = vi.fn().mockResolvedValue(undefined);
    const lastFired = new Map<string, number>();

    await fireDueSchedules(executor(fireSchedule), new Date("2026-10-21T06:59:00.000Z"), lastFired);
    expect(fireSchedule).not.toHaveBeenCalled();

    await fireDueSchedules(executor(fireSchedule), new Date("2026-10-21T07:01:30.000Z"), lastFired);
    expect(fireSchedule).toHaveBeenCalledTimes(1);
    expect(fireSchedule).toHaveBeenCalledWith(
      "org-1",
      "atm_1",
      new Date("2026-10-21T07:00:00.000Z"),
    );
  });

  it("considers only the current minute on the first tick", async () => {
    const fireSchedule = vi.fn().mockResolvedValue(undefined);
    const lastFired = new Map<string, number>();

    await fireDueSchedules(executor(fireSchedule), new Date("2026-10-22T06:30:00.000Z"), lastFired);
    expect(fireSchedule).not.toHaveBeenCalled();
    expect([...lastFired.values()]).toEqual([new Date("2026-10-22T06:30:00.000Z").getTime()]);

    await fireDueSchedules(executor(fireSchedule), new Date("2026-10-22T06:31:00.000Z"), lastFired);
    expect(fireSchedule).not.toHaveBeenCalled();
  });

  it("fires on the first tick when the current minute matches", async () => {
    const fireSchedule = vi.fn().mockResolvedValue(undefined);

    await fireDueSchedules(executor(fireSchedule), new Date("2026-10-21T07:00:45.000Z"), new Map());

    expect(fireSchedule).toHaveBeenCalledTimes(1);
    expect(fireSchedule).toHaveBeenCalledWith(
      "org-1",
      "atm_1",
      new Date("2026-10-21T07:00:00.000Z"),
    );
  });

  it("does not reach back for a schedule first seen after start", async () => {
    const fireSchedule = vi.fn().mockResolvedValue(undefined);

    await fireDueSchedules(executor(fireSchedule), new Date("2026-10-21T10:00:00.000Z"), new Map());

    expect(fireSchedule).not.toHaveBeenCalled();
  });

  it("retries a minute whose fire failed", async () => {
    const fireSchedule = vi
      .fn()
      .mockRejectedValueOnce(new Error("down"))
      .mockResolvedValue(undefined);
    const lastFired = new Map<string, number>();
    const at = new Date("2026-10-21T07:00:00.000Z");

    await fireDueSchedules(executor(fireSchedule), at, lastFired);
    await fireDueSchedules(executor(fireSchedule), at, lastFired);

    expect(fireSchedule).toHaveBeenCalledTimes(2);
  });

  it("logs a failed fire with its schedule and the error", async () => {
    const { logger, entries } = createCapturingLogger();
    const err = new Error("down");
    const fireSchedule = vi.fn().mockRejectedValue(err);

    await fireDueSchedules(
      executor(fireSchedule),
      new Date("2026-10-21T07:00:00.000Z"),
      new Map(),
      logger,
    );

    expect(entries).toEqual([
      {
        level: "error",
        msg: "automation schedule not fired",
        meta: {
          orgId: "org-1",
          automationId: "atm_1",
          cron: "0 7 * * *",
          at: "2026-10-21T07:00:00.000Z",
          err,
        },
      },
    ]);
  });

  it("logs a failed listing and fires nothing", async () => {
    const { logger, entries } = createCapturingLogger();
    const err = new Error("db down");
    const fireSchedule = vi.fn();

    const ran = await fireDueSchedules(
      { ...executor(fireSchedule), listSchedules: vi.fn().mockRejectedValue(err) },
      new Date("2026-10-21T07:00:00.000Z"),
      new Map(),
      logger,
    );

    expect(ran).toBe(false);
    expect(fireSchedule).not.toHaveBeenCalled();
    expect(entries).toEqual([
      { level: "error", msg: "automation schedules not listed", meta: { err } },
    ]);
  });
});
