// Same-process outbox relay (implements the core OutboxRelay port). A
// setTimeout-CHAINED poller (never setInterval — a slow batch must not overlap
// the next tick): each tick fetches unprocessed rows in id order and publishes
// them to the EventBus, up to `concurrency` at once and in id order per ordering key.
//
// Delivery is at-least-once — handlers must be idempotent, keyed on event.id.
// Ordering is skip-past-failures: a failing row is stamped with the error and
// an exponential-backoff next_attempt_at (retried once due) while later rows
// flow; the store stops fetching it after OUTBOX_MAX_ATTEMPTS failures.
import type {
  DomainEvent,
  EventBus,
  Logger,
  OutboxMessage,
  OutboxRelay,
  OutboxStore,
} from "@headless-lms/core/shared/ports";
import { OUTBOX_MAX_ATTEMPTS } from "@headless-lms/adapter-db";

/** Backoff base: first retry 5s after the first failure, doubling per attempt. */
export const OUTBOX_BACKOFF_BASE_MS = 5_000;
/** Backoff ceiling: retries never wait longer than 15 minutes. */
export const OUTBOX_BACKOFF_MAX_MS = 15 * 60_000;

/** Exponential backoff delay after a failure: min(base × 2^attempts, max),
 *  where `attempts` is the PRIOR failure count (0 on the first failure). */
export function outboxBackoffMs(attempts: number): number {
  return Math.min(OUTBOX_BACKOFF_BASE_MS * 2 ** attempts, OUTBOX_BACKOFF_MAX_MS);
}

export interface PollingOutboxRelayConfig {
  /** Master switch: false → start() is a no-op. */
  enabled: boolean;
  /** Idle delay between polls. */
  pollIntervalMs: number;
  /** Max rows fetched/dispatched per tick; a full batch re-polls immediately. */
  batchSize: number;
  concurrency: number;
}

const ORDERING_FIELDS = ["chatId", "postId", "activityId", "commentId", "id"] as const;

export function orderingKey(event: DomainEvent): string {
  const data = event.data;
  if (data !== null && typeof data === "object") {
    for (const field of ORDERING_FIELDS) {
      const value = (data as Record<string, unknown>)[field];
      if (typeof value === "string" && value.length > 0) {
        return `${event.orgId}:${value}`;
      }
    }
  }
  return `${event.orgId}:${event.id}`;
}

export class PollingOutboxRelay implements OutboxRelay {
  private pollTimer: NodeJS.Timeout | undefined;
  private running = false;
  private inFlight: Promise<void> = Promise.resolve();

  constructor(
    private readonly store: OutboxStore,
    private readonly bus: EventBus,
    private readonly config: PollingOutboxRelayConfig,
    private readonly logger: Logger,
  ) {}

  start(): void {
    if (!this.config.enabled || this.running) {
      return;
    }
    this.running = true;
    this.schedule(this.config.pollIntervalMs);
    this.logger.info("outbox relay started", {
      pollIntervalMs: this.config.pollIntervalMs,
      batchSize: this.config.batchSize,
      concurrency: this.config.concurrency,
    });
  }

  async stop(): Promise<void> {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
    }
    this.pollTimer = undefined;
    const wasRunning = this.running;
    this.running = false;
    await this.inFlight;
    if (wasRunning) {
      this.logger.info("outbox relay stopped");
    }
  }

  private schedule(delayMs: number): void {
    if (!this.running) {
      return;
    }
    this.pollTimer = setTimeout(() => {
      this.inFlight = this.tick();
    }, delayMs);
  }

  /** One poll: fetch a batch, dispatch in order per ordering key, reschedule — immediately when
   *  the batch was full (drain bursts), else after the idle interval. Never
   *  throws: a poll failure is logged and retried next tick. */
  private async tick(): Promise<void> {
    let fetched = 0;
    try {
      const batch = await this.store.fetchBatch(this.config.batchSize);
      fetched = batch.length;
      if (fetched > 0) {
        this.logger.debug("outbox batch fetched", { count: fetched });
      }
      await this.dispatchBatch(batch);
    } catch (err) {
      this.logger.error("outbox poll failed", { error: String(err) });
    }
    this.schedule(fetched >= this.config.batchSize ? 0 : this.config.pollIntervalMs);
  }

  private async dispatchBatch(batch: OutboxMessage[]): Promise<void> {
    const lanes = new Map<string, OutboxMessage[]>();
    for (const message of batch) {
      const key = orderingKey(message.payload);
      const lane = lanes.get(key);
      if (lane) {
        lane.push(message);
      } else {
        lanes.set(key, [message]);
      }
    }
    const queue = [...lanes.values()];
    const workers = Math.min(Math.max(1, this.config.concurrency), queue.length);
    await Promise.all(
      Array.from({ length: workers }, async () => {
        for (let lane = queue.shift(); lane; lane = queue.shift()) {
          for (const message of lane) {
            await this.dispatch(message);
          }
        }
      }),
    );
  }

  private async dispatch(message: OutboxMessage): Promise<void> {
    try {
      await this.bus.publish(message.payload);
      await this.store.markProcessed(message.id);
      this.logger.info("outbox event dispatched", {
        id: message.id,
        type: message.payload.type,
      });
    } catch (err) {
      const error = String(err);
      const nextAttemptAt = new Date(Date.now() + outboxBackoffMs(message.attempts));
      try {
        await this.store.markFailed(message.id, error, nextAttemptAt);
      } catch (markErr) {
        this.logger.error("outbox failure not recorded", {
          id: message.id,
          type: message.payload.type,
          error,
          markError: String(markErr),
        });
        return;
      }
      const attempt = message.attempts + 1;
      const meta = {
        id: message.id,
        type: message.payload.type,
        attempt,
        nextAttemptAt: nextAttemptAt.toISOString(),
        error,
      };
      // The store stops fetching after OUTBOX_MAX_ATTEMPTS — this failure parks the row.
      if (attempt >= OUTBOX_MAX_ATTEMPTS) {
        this.logger.warn("outbox event parked", meta);
      } else {
        this.logger.error("outbox dispatch failed", meta);
      }
    }
  }
}
