import type { AutomationExecutor, ScheduledAutomation } from '../types/index.js';

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

export function startScheduleLoop(getExecutor: () => AutomationExecutor | undefined): {
  stop(): void;
} {
  let timer: ReturnType<typeof setInterval> | undefined;
  const tick = async () => {
    const executor = getExecutor();
    if (!executor?.listSchedules || !executor.fireSchedule) {
      return;
    }
    const now = new Date();
    now.setUTCSeconds(0, 0);
    let schedules: ScheduledAutomation[] = [];
    try {
      schedules = await executor.listSchedules();
    } catch {
      return;
    }
    for (const schedule of schedules) {
      if (!cronMatches(schedule.cron, now)) {
        continue;
      }
      try {
        await executor.fireSchedule(schedule.orgId, schedule.automationId, now);
      } catch {
        continue;
      }
    }
  };
  void tick();
  timer = setInterval(() => {
    void tick();
  }, 60_000);
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
