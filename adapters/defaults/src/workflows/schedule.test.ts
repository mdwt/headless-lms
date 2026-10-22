import { describe, expect, it, vi } from "vitest";
import type { AutomationExecutor } from "@headless-lms/core/types";
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
});
