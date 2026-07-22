// Same-process outbox relay (implements the core OutboxRelay port). A
// setTimeout-CHAINED poller (never setInterval for the poll — a slow batch
// must not overlap the next tick): each tick fetches due unpublished rows in
// commit order and publishes them to the EventBus (fan-out to subscribers).
//
// Delivery is at-least-once — handlers must be idempotent, keyed on event.id.
// Ordering is skip-past-failures: a failing row is backed off (capped
// exponential) and retried while later rows flow; after maxAttempts it is
// parked (published_at NULL, excluded from fetch by the store) and logged —
// the log-only dead letter. Re-drive manually:
//   UPDATE outbox SET attempts = 0 WHERE id = <id>;
// A separate interval sweeps published rows past the retention window.
import type {
  EventBus,
  Logger,
  OutboxMessage,
  OutboxRelay,
  OutboxStore,
} from "../../core/shared/ports.js";

export interface PollingOutboxRelayConfig {
  /** Master switch: false → start() is a no-op. */
  enabled: boolean;
  /** Idle delay between polls. */
  pollIntervalMs: number;
  /** Max rows fetched/dispatched per tick; a full batch re-polls immediately. */
  batchSize: number;
  /** Attempts before a message is parked as a dead letter. */
  maxAttempts: number;
  /** Backoff = min(backoffBaseMs * 2^attempts, backoffMaxMs). */
  backoffBaseMs: number;
  backoffMaxMs: number;
  /** Published rows older than this many days are swept. */
  retentionDays: number;
  /** Sweep cadence. */
  cleanupIntervalMs: number;
}

const DAY_MS = 86_400_000;

export class PollingOutboxRelay implements OutboxRelay {
  private pollTimer: NodeJS.Timeout | undefined;
  private cleanupTimer: NodeJS.Timeout | undefined;
  private running = false;
  private inFlight: Promise<void> = Promise.resolve();
  private sweepInFlight: Promise<void> = Promise.resolve();

  constructor(
    private readonly store: OutboxStore,
    private readonly bus: EventBus,
    private readonly config: PollingOutboxRelayConfig,
    private readonly logger: Logger,
  ) {}

  start(): void {
    if (!this.config.enabled || this.running) return;
    this.running = true;
    this.schedule(this.config.pollIntervalMs);
    this.cleanupTimer = setInterval(() => {
      this.sweepInFlight = this.sweep();
    }, this.config.cleanupIntervalMs);
    this.logger.info("outbox relay started", {
      pollIntervalMs: this.config.pollIntervalMs,
      batchSize: this.config.batchSize,
    });
  }

  async stop(): Promise<void> {
    if (this.pollTimer) clearTimeout(this.pollTimer);
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    this.pollTimer = undefined;
    this.cleanupTimer = undefined;
    const wasRunning = this.running;
    this.running = false;
    await this.inFlight;
    await this.sweepInFlight;
    if (wasRunning) this.logger.info("outbox relay stopped");
  }

  private schedule(delayMs: number): void {
    if (!this.running) return;
    this.pollTimer = setTimeout(() => {
      this.inFlight = this.tick();
    }, delayMs);
  }

  /** One poll: fetch a batch, dispatch in commit order, reschedule —
   *  immediately when the batch was full (drain bursts), else after the idle
   *  interval. Never throws: a poll failure is logged and retried next tick. */
  private async tick(): Promise<void> {
    let fetched = 0;
    try {
      const batch = await this.store.fetchBatch(this.config.batchSize);
      fetched = batch.length;
      for (const message of batch) {
        await this.dispatch(message);
      }
    } catch (err) {
      this.logger.error("outbox poll failed", { error: String(err) });
    }
    this.schedule(fetched >= this.config.batchSize ? 0 : this.config.pollIntervalMs);
  }

  /** Publish one message to all subscribers; on failure, back off and skip
   *  past (the rest of the batch still dispatches). The outbox row is the
   *  retry unit: a retried event re-runs EVERY handler for it. */
  private async dispatch(message: OutboxMessage): Promise<void> {
    try {
      await this.bus.publish(message.payload);
      await this.store.markPublished(message.id);
    } catch (err) {
      const attempts = message.attempts + 1;
      const delayMs = Math.min(
        this.config.backoffBaseMs * 2 ** message.attempts,
        this.config.backoffMaxMs,
      );
      await this.store.markFailed(message.id, String(err), new Date(Date.now() + delayMs));
      if (attempts >= this.config.maxAttempts) {
        this.logger.error("outbox message parked: max attempts reached", {
          id: message.id,
          eventId: message.eventId,
          type: message.type,
          attempts,
        });
      } else {
        this.logger.error("outbox dispatch failed", {
          id: message.id,
          eventId: message.eventId,
          type: message.type,
          attempts,
          retryInMs: delayMs,
        });
      }
    }
  }

  private async sweep(): Promise<void> {
    try {
      const cutoff = new Date(Date.now() - this.config.retentionDays * DAY_MS);
      const deleted = await this.store.deletePublishedBefore(cutoff);
      if (deleted > 0) this.logger.info("outbox retention sweep", { deleted });
    } catch (err) {
      this.logger.error("outbox retention sweep failed", { error: String(err) });
    }
  }
}
