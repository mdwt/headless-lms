import { index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { EventOutbox } from "@headless-lms/core/schemas";
import { genId } from "@headless-lms/core/shared/id";
import type { Expect, NoDrift } from "./drift.js";

export const eventOutbox = pgTable(
  "event_outbox",
  {
    orgId: text("org_id").notNull(),
    id: text("id")
      .primaryKey()
      .$defaultFn(() => genId("event")),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<EventOutbox["payload"]>().notNull(),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (t) => ({
    pendingIdx: index("event_outbox_pending_idx")
      .on(t.id)
      .where(sql`${t.processedAt} is null`),
  }),
);

type _EventOutboxDrift = Expect<NoDrift<typeof eventOutbox.$inferSelect, EventOutbox>>;
