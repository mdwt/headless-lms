// settings — cross-cutting configuration store. One row per
// (org, namespace, scope): the namespace names the domain that owns and
// interprets the values; the scope is the id the settings attach to (an org id
// for org-wide defaults, otherwise any entity id — a course, an activity, …).
//
// Deliberately NOT bound to any domain: no FK to content or anywhere else, so
// settings never learns what it is scoping. Rows orphaned by a deleted entity
// are purged off that domain's *.deleted event, not by cascade.
import { pgTable, text, jsonb, timestamp, primaryKey } from "drizzle-orm/pg-core";
import type { Setting } from "@headless-lms/core/schemas";
import { organizations } from "./organizations.js";
import type { Expect, NoDrift } from "./drift.js";

export const settings = pgTable(
  "settings",
  {
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    // The owning domain: 'content', 'discussion', … Values are validated and
    // interpreted by that domain, never here.
    namespace: text("namespace").notNull(),
    // Org-scoped rows carry the org id, so the column is never null and the
    // natural key can be the primary key.
    scopeId: text("scope_id").notNull(),
    value: jsonb("value").$type<Setting["value"]>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.orgId, t.namespace, t.scopeId] }),
  }),
);

type _SettingsDrift = Expect<NoDrift<typeof settings.$inferSelect, Setting>>;
