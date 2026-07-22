// outbox — Drizzle appender + store (implement the core outbox ports).
//
// DrizzleOutboxAppender is constructed with the TRANSACTION executor of a
// DrizzleUnitOfWork scope — the same-transaction guarantee lives here: the
// appended row commits (or rolls back) with the domain write.
// DrizzleOutboxStore is constructed with the root db and serves the relay:
// batch fetch (FOR UPDATE SKIP LOCKED in its own short tx), publish/failure
// bookkeeping, and the retention sweep.
import { and, asc, eq, isNotNull, isNull, lt, lte, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type {
  DomainEvent,
  NewDomainEvent,
  OutboxAppender,
  OutboxMessage,
  OutboxStore,
} from "../../../core/shared/ports.js";
import { genId } from "../../../core/shared/id.js";
import type { DbExecutor } from "../index.js";
import { outbox } from "../schema/outbox.js";

/** Stamp `id` + `occurredAt` onto a producer-constructed event. Pure; exported for tests. */
export function stampEvent<E extends NewDomainEvent>(
  event: E,
  at: Date = new Date(),
): E & { id: string; occurredAt: string } {
  return { ...event, id: genId("event"), occurredAt: at.toISOString() };
}

export class DrizzleOutboxAppender implements OutboxAppender {
  constructor(private readonly tx: DbExecutor) {}

  async append<E extends NewDomainEvent>(events: E[]): Promise<void> {
    if (events.length === 0) return;
    const rows = events.map((event) => {
      const stamped = stampEvent(event);
      const record = stamped as Record<string, unknown>;
      return {
        eventId: stamped.id,
        type: stamped.type,
        orgId: typeof record["orgId"] === "string" ? (record["orgId"] as string) : null,
        payload: stamped as unknown as Record<string, unknown>,
        occurredAt: new Date(stamped.occurredAt),
      };
    });
    await this.tx.insert(outbox).values(rows);
  }
}

export class DrizzleOutboxStore implements OutboxStore {
  constructor(
    private readonly db: NodePgDatabase,
    /** Rows with attempts >= maxAttempts are parked: excluded from fetchBatch, kept for inspection. */
    private readonly maxAttempts: number,
  ) {}

  async fetchBatch(limit: number): Promise<OutboxMessage[]> {
    // Own short transaction: FOR UPDATE SKIP LOCKED lets a second process
    // claim disjoint rows if the deployment ever scales out.
    const rows = await this.db.transaction((tx) =>
      tx
        .select()
        .from(outbox)
        .where(
          and(
            isNull(outbox.publishedAt),
            lte(outbox.nextAttemptAt, new Date()),
            lt(outbox.attempts, this.maxAttempts),
          ),
        )
        .orderBy(asc(outbox.id))
        .limit(limit)
        .for("update", { skipLocked: true }),
    );
    return rows.map((row) => ({
      id: String(row.id),
      eventId: row.eventId,
      type: row.type,
      payload: row.payload as unknown as DomainEvent,
      attempts: row.attempts,
    }));
  }

  async markPublished(id: string): Promise<void> {
    await this.db
      .update(outbox)
      .set({ publishedAt: new Date() })
      .where(eq(outbox.id, BigInt(id)));
  }

  async markFailed(id: string, error: string, nextAttemptAt: Date): Promise<void> {
    await this.db
      .update(outbox)
      .set({ attempts: sql`${outbox.attempts} + 1`, lastError: error, nextAttemptAt })
      .where(eq(outbox.id, BigInt(id)));
  }

  async deletePublishedBefore(cutoff: Date): Promise<number> {
    const deleted = await this.db
      .delete(outbox)
      .where(and(isNotNull(outbox.publishedAt), lt(outbox.publishedAt, cutoff)))
      .returning({ id: outbox.id });
    return deleted.length;
  }
}
