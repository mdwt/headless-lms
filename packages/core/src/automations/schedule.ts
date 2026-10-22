import type { AutomationExecutor, ScheduledAutomation } from '../types/index.js';

const FIELD_RANGES = [
  [0, 59],
  [0, 23],
  [1, 31],
  [1, 12],
  [0, 6],
] as const;

const MINUTE_MS = 60_000;

export function cronMatches(expression: string, at: Date): boolean {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) {
    return false;
  }
  const parts = [
    at.getUTCMinutes(),
    at.getUTCHours(),
    at.getUTCDate(),
    at.getUTCMonth() + 1,
    at.getUTCDay(),
  ];
  return fields.every((field, index) => {
    if (field === '*') {
      return true;
    }
    const value = parts[index];
    return field.split(',').some((piece) => Number(piece) === value);
  });
}

export function cronSupported(expression: string): boolean {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) {
    return false;
  }
  return fields.every((field, index) => fieldSupported(field, FIELD_RANGES[index]!));
}

function fieldSupported(field: string, range: readonly [number, number]): boolean {
  if (field === '*') {
    return true;
  }
  const pieces = field.split(',');
  const [min, max] = range;
  return (
    pieces.length > 0 &&
    pieces.every((piece) => {
      if (!/^\d+$/.test(piece)) {
        return false;
      }
      const value = Number(piece);
      return value >= min && value <= max;
    })
  );
}

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
): Promise<void> {
  if (!executor.listSchedules || !executor.fireSchedule) {
    return;
  }
  const nowMs = floorUtcMinute(now);
  let schedules: ScheduledAutomation[] = [];
  try {
    schedules = await executor.listSchedules();
  } catch {
    return;
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
