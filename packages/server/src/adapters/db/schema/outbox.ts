// Transactional outbox. Infrastructure, not a domain table — the org-scoped
// composite (org_id, id) PK convention deliberately does not apply: a
// monotonic bigserial PK is the relay's commit-order polling key. org_id is
// nullable (platform-level events may exist) and kept for filtering/debugging.
// Rows are appended by DrizzleOutboxAppender inside the SAME transaction as
// the domain write, and drained by the relay via DrizzleOutboxStore.
import { bigserial, index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { genId } from "../../../core/shared/id.js";

export const outbox = pgTable(
  "outbox",
  {
    /** Monotonic position — the relay's ordering and paging key. */
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    /** Stable event identity for consumer-side idempotency/dedup. */
    eventId: text("event_id")
      .notNull()
      .unique()
      .$defaultFn(() => genId("event")),
    /** DomainEvent.type, e.g. "enrollment.created". */
    type: text("type").notNull(),
    /** The org the event belongs to; null for platform-level events. */
    orgId: text("org_id"),
    /** The full DomainEvent, JSON-serialised — self-contained snapshot. */
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    /** When the producing transaction wrote the row. */
    occurredAt: timestamp("occurred_at").notNull().defaultNow(),
    /** Set once the relay has dispatched to all subscribers. NULL = pending. */
    publishedAt: timestamp("published_at"),
    /** Dispatch attempts so far. attempts >= maxAttempts ⇒ parked (dead letter, log-only). */
    attempts: integer("attempts").notNull().default(0),
    /** Earliest next dispatch (backoff schedule). */
    nextAttemptAt: timestamp("next_attempt_at").notNull().defaultNow(),
    /** Message of the most recent dispatch failure. */
    lastError: text("last_error"),
  },
  (t) => ({
    // Partial index: the poll query's exact shape. Stays tiny — only
    // unpublished rows live in it; published rows fall out on update.
    unpublishedIdx: index("outbox_unpublished_idx")
      .on(t.nextAttemptAt, t.id)
      .where(sql`${t.publishedAt} is null`),
  }),
);
