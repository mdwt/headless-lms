import { and, asc, eq, isNull, lt, lte, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type {
  DomainEvent,
  NewDomainEvent,
  OutboxAppender,
  OutboxMessage,
  OutboxStore,
  Logger,
} from '../../../core/shared/ports.js';
import { noopLogger } from '../../../core/shared/logger.js';
import type { DbExecutor } from '../index.js';
import { eventOutbox } from '../schema/outbox.js';

/** A message that fails this many dispatches is parked: fetchBatch stops
 *  claiming it, leaving the row (with its last_error) for inspection. */
export const OUTBOX_MAX_ATTEMPTS = 10;

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
        payload: event as unknown as Record<string, unknown>,
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
    const rows = await this.db.transaction((tx) =>
      tx
        .select()
        .from(eventOutbox)
        .where(
          and(
            isNull(eventOutbox.processedAt),
            lte(eventOutbox.nextAttemptAt, new Date()),
            lt(eventOutbox.attempts, OUTBOX_MAX_ATTEMPTS),
          ),
        )
        .orderBy(asc(eventOutbox.id))
        .limit(limit)
        .for('update', { skipLocked: true }),
    );
    return rows.map((row) => ({
      id: row.id,
      attempts: row.attempts,
      payload: {
        ...row.payload,
        id: row.id,
        createdAt: row.createdAt.toISOString(),
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
