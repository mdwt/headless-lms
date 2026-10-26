import type { AutomationExecutor, ScheduledAutomation } from "@headless-lms/core/types";
import { cronMatches } from "@headless-lms/core/automations";

const MINUTE_MS = 60_000;

function floorUtcMinute(at: Date): number {
  const copy = new Date(at);
  copy.setUTCSeconds(0, 0);
  return copy.getTime();
}

function scheduleKey(schedule: ScheduledAutomation): string {
  return `${schedule.orgId}\0${schedule.automationId}\0${schedule.cron}`;
}

export async function fireDueSchedules(
  executor: AutomationExecutor,
  now: Date,
  lastFired: Map<string, number>,
): Promise<boolean> {
  if (!executor.listSchedules || !executor.fireSchedule) {
    return false;
  }
  const nowMs = floorUtcMinute(now);
  let schedules: ScheduledAutomation[] = [];
  try {
    schedules = await executor.listSchedules();
  } catch {
    return false;
  }
  const seen = new Set<string>();
  for (const schedule of schedules) {
    const key = scheduleKey(schedule);
    seen.add(key);
    const previous = lastFired.get(key);
    const start = previous == null ? nowMs : previous + MINUTE_MS;
    for (let minute = start; minute <= nowMs; minute += MINUTE_MS) {
      if (cronMatches(schedule.cron, new Date(minute))) {
        try {
          await executor.fireSchedule(schedule.orgId, schedule.automationId, new Date(minute));
        } catch {
          if (!lastFired.has(key)) {
            lastFired.set(key, minute - MINUTE_MS);
          }
          break;
        }
      }
      lastFired.set(key, minute);
    }
  }
  for (const key of lastFired.keys()) {
    if (!seen.has(key)) {
      lastFired.delete(key);
    }
  }
  return true;
}

export function startScheduleLoop(getExecutor: () => AutomationExecutor | undefined): {
  stop(): void;
} {
  const lastFired = new Map<string, number>();
  let timer: ReturnType<typeof setInterval> | undefined;
  let running = false;
  const tick = () => {
    if (running) {
      return;
    }
    const executor = getExecutor();
    if (!executor) {
      return;
    }
    running = true;
    void fireDueSchedules(executor, new Date(), lastFired).finally(() => {
      running = false;
    });
  };
  tick();
  timer = setInterval(tick, MINUTE_MS);
  timer.unref?.();
  return {
    stop() {
      if (timer) {
        clearInterval(timer);
      }
      timer = undefined;
    },
  };
}
