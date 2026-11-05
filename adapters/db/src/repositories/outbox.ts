import { and, asc, eq, inArray, isNull, lt, lte, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type {
  DomainEvent,
  NewDomainEvent,
  OutboxAppender,
  OutboxMessage,
  OutboxStore,
  Logger,
} from "@headless-lms/core/shared/ports";
import { noopLogger } from "@headless-lms/core/shared/logger";
import type { EventOutbox } from "@headless-lms/core/schemas";
import type { DbExecutor } from "../client.js";
import { eventOutbox } from "../schema/outbox.js";
import { translateDbErrors } from "./pg-errors.js";

/** A message that fails this many dispatches is parked: fetchBatch stops
 *  claiming it, leaving the row (with its last_error) for inspection. */
export const OUTBOX_MAX_ATTEMPTS = 10;

/** How long a fetched message stays claimed by the relay that fetched it. Another
 *  relay fetches it again only after this, so a relay that dies mid-batch delays
 *  its messages by at most this long. */
export const OUTBOX_CLAIM_MS = 60_000;

export class DrizzleOutboxAppender implements OutboxAppender {
  constructor(
    private readonly tx: DbExecutor,
    private readonly logger: Logger = noopLogger,
  ) {}

  async append<E extends NewDomainEvent>(events: E[]): Promise<void> {
    if (events.length === 0) {
      return;
    }
    await this.tx.insert(eventOutbox).values(
      events.map((event) => ({
        type: event.type,
        orgId: event.orgId,
        payload: event as unknown as EventOutbox["payload"],
      })),
    );
  }
}

export class DrizzleOutboxStore implements OutboxStore {
  constructor(
    private readonly db: NodePgDatabase,
    private readonly logger: Logger = noopLogger,
  ) {}

  async fetchBatch(limit: number): Promise<OutboxMessage[]> {
    const now = new Date();
    const rows = await this.db.transaction(async (tx) => {
      const due = await tx
        .select()
        .from(eventOutbox)
        .where(
          and(
            isNull(eventOutbox.processedAt),
            lte(eventOutbox.nextAttemptAt, now),
            lt(eventOutbox.attempts, OUTBOX_MAX_ATTEMPTS),
          ),
        )
        .orderBy(asc(eventOutbox.id))
        .limit(limit)
        .for("update", { skipLocked: true });
      if (due.length > 0) {
        await tx
          .update(eventOutbox)
          .set({ nextAttemptAt: new Date(now.getTime() + OUTBOX_CLAIM_MS) })
          .where(
            inArray(
              eventOutbox.id,
              due.map((row) => row.id),
            ),
          );
      }
      return due;
    });
    return rows.map((row) => ({
      id: row.id,
      attempts: row.attempts,
      payload: {
        ...row.payload,
        id: row.id,
        occurredAt: row.createdAt.toISOString(),
      } as unknown as DomainEvent,
    }));
  }

  async markProcessed(id: string): Promise<void> {
    await this.db
      .update(eventOutbox)
      .set({ processedAt: new Date() })
      .where(eq(eventOutbox.id, id));
  }

  async markFailed(id: string, error: string, nextAttemptAt: Date): Promise<void> {
    await this.db
      .update(eventOutbox)
      .set({
        attempts: sql`${eventOutbox.attempts} + 1`,
        lastError: error,
        nextAttemptAt,
      })
      .where(eq(eventOutbox.id, id));
  }
}
translateDbErrors(DrizzleOutboxAppender);
translateDbErrors(DrizzleOutboxStore);
