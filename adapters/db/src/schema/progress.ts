// progress tables — one progress record per org user per target (activity,
// module, or course). Tracks lifecycle: started_at on open, position
// (typed resume payload) as the player reports it, completed_at when the rule is
// satisfied (null = in progress). Target is denormalized (type + id, no FK) so a
// record survives structure edits. Percentage and resume are derived on read;
// nothing here is a stored percentage.
import {
  pgTable,
  text,
  jsonb,
  timestamp,
  primaryKey,
  unique,
  foreignKey,
} from "drizzle-orm/pg-core";
import type { ProgressRecord } from "@headless-lms/core/schemas";
import { genId } from "@headless-lms/core/shared/id";
import { organizations, orgUsers } from "./organizations.js";
import type { Expect, NoDrift } from "./drift.js";

export const progressRecords = pgTable(
  "progress_records",
  {
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    id: text("id")
      .notNull()
      .$defaultFn(() => genId("progress")),
    orgUserId: text("org_user_id").notNull(),
    targetType: text("target_type", {
      enum: ["activity", "module", "course"],
    }).notNull(),
    targetId: text("target_id").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    position: jsonb("position").$type<ProgressRecord["position"]>(), // opaque typed payload; service interprets per target type
    completedAt: timestamp("completed_at", { withTimezone: true }), // null = in progress
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.orgId, t.id] }),
    targetUq: unique().on(t.orgId, t.orgUserId, t.targetType, t.targetId),
    // The one org user reference the schema previously left unenforced.
    orgUserFk: foreignKey({
      columns: [t.orgId, t.orgUserId],
      foreignColumns: [orgUsers.orgId, orgUsers.id],
    }),
  }),
);

type _ProgressRecordsDrift = Expect<NoDrift<typeof progressRecords.$inferSelect, ProgressRecord>>;
