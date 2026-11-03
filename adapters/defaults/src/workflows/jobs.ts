import { randomUUID } from "node:crypto";
import type { JsonValue, Logger } from "@headless-lms/core/types";
import type { RecurringJob, ScheduledJob } from "@headless-lms/core/shared/ports";
import { cronMatches } from "@headless-lms/core/automations";
import { noopLogger } from "@headless-lms/core/shared/logger";

const MINUTE_MS = 60_000;
const MAX_TIMER_MS = 2_147_483_647;

function floorUtcMinute(at: Date): number {
  const copy = new Date(at);
  copy.setUTCSeconds(0, 0);
  return copy.getTime();
}

function timerKey(job: string, key: string): string {
  return `${job}\0${key}`;
}

export class InlineJobs {
  private handlers = new Map<string, ScheduledJob>();
  private recurring: RecurringJob[] = [];
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private loop: ReturnType<typeof setInterval> | undefined;
  private lastMinute: number | undefined;
  private ticking = false;

  constructor(private readonly logger: Logger = noopLogger) {}

  register(handlers: ScheduledJob[], recurring: RecurringJob[]): void {
    this.handlers = new Map(handlers.map((handler) => [handler.job, handler]));
    this.recurring = [...recurring];
  }

  at(job: string, runAt: Date, key: string, payload: JsonValue): void {
    const id = timerKey(job, key);
    this.clear(id);
    this.arm(id, job, key, runAt.getTime(), payload);
  }

  cancel(job: string, key: string): void {
    this.clear(timerKey(job, key));
  }

  start(): void {
    this.stopLoop();
    this.tick();
    this.loop = setInterval(() => this.tick(), MINUTE_MS);
    this.loop.unref?.();
  }

  stop(): void {
    this.stopLoop();
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }

  private stopLoop(): void {
    if (this.loop) {
      clearInterval(this.loop);
    }
    this.loop = undefined;
  }

  private arm(id: string, job: string, key: string, runAtMs: number, payload: JsonValue): void {
    const delay = Math.min(Math.max(runAtMs - Date.now(), 0), MAX_TIMER_MS);
    const timer = setTimeout(() => {
      if (runAtMs > Date.now()) {
        this.arm(id, job, key, runAtMs, payload);
        return;
      }
      this.timers.delete(id);
      void this.fire(job, key, payload);
    }, delay);
    timer.unref?.();
    this.timers.set(id, timer);
  }

  private clear(id: string): void {
    const timer = this.timers.get(id);
    if (timer) {
      clearTimeout(timer);
    }
    this.timers.delete(id);
  }

  private tick(): void {
    if (this.ticking) {
      return;
    }
    this.ticking = true;
    void this.fireDue(new Date()).finally(() => {
      this.ticking = false;
    });
  }

  private async fireDue(now: Date): Promise<void> {
    const nowMs = floorUtcMinute(now);
    const from = this.lastMinute === undefined ? nowMs : this.lastMinute + MINUTE_MS;
    for (let minute = from; minute <= nowMs; minute += MINUTE_MS) {
      this.lastMinute = minute;
      const at = new Date(minute);
      for (const recurring of this.recurring) {
        if (cronMatches(recurring.cron, at)) {
          await this.fire(recurring.job, recurring.job, null);
        }
      }
    }
  }

  private async fire(job: string, key: string, payload: JsonValue): Promise<void> {
    const handler = this.handlers.get(job);
    if (!handler) {
      this.logger.error("scheduled job has no handler", { job, key });
      return;
    }
    try {
      await handler.run(payload, { id: randomUUID(), startedAt: new Date() });
    } catch (err) {
      this.logger.error("scheduled job failed", { job, key, err });
    }
  }
}
