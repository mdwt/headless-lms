import { sql } from "drizzle-orm";
import {
  pgTable,
  pgView,
  text,
  timestamp,
  primaryKey,
  foreignKey,
  unique,
  check,
} from "drizzle-orm/pg-core";
import type { Entitlement } from "@headless-lms/core/schemas";
import { genId } from "@headless-lms/core/shared/id";
import { organizations, orgUsers } from "./organizations.js";
import { bundles, contentItems } from "./content.js";
import type { Expect, NoDrift } from "./drift.js";

export const entitlements = pgTable(
  "entitlements",
  {
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    id: text("id")
      .notNull()
      .$defaultFn(() => genId("entitlement")),
    orgUserId: text("org_user_id").notNull(),
    bundleId: text("bundle_id"),
    contentId: text("content_id"),
    status: text("status", { enum: ["active", "revoked"] })
      .notNull()
      .default("active"),
    // Free text: 'manual', 'import', integration ids, …
    source: text("source").notNull().default("manual"),
    grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }), // null = lifetime
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.orgId, t.id] }),
    // Grants die with their content: deleting the registry row cascades here.
    contentFk: foreignKey({
      columns: [t.orgId, t.contentId],
      foreignColumns: [contentItems.orgId, contentItems.id],
    }).onDelete("cascade"),
    // Grants die with their bundle, same as with their content.
    bundleFk: foreignKey({
      columns: [t.orgId, t.bundleId],
      foreignColumns: [bundles.orgId, bundles.id],
    }).onDelete("cascade"),
    // org_users is org-scoped (composite PK) — the FK must match both columns.
    // Grants die with their org user: deleting the org_users row cascades here.
    orgUserFk: foreignKey({
      columns: [t.orgId, t.orgUserId],
      foreignColumns: [orgUsers.orgId, orgUsers.id],
    }).onDelete("cascade"),
    // One grant per (org, org user, content) and per (org, org user, bundle) —
    // the unused column is null, and nulls never collide, so each constraint
    // only sees grants of its own kind. Both are the upsert targets.
    orgUserContentUq: unique().on(t.orgId, t.orgUserId, t.contentId),
    orgUserBundleUq: unique().on(t.orgId, t.orgUserId, t.bundleId),
    // A grant targets exactly one of: a bundle or a content item.
    targetCk: check(
      "entitlements_target_check",
      sql`num_nonnulls(${t.bundleId}, ${t.contentId}) = 1`,
    ),
  }),
);

// Who can open what, right now: one row per (org user, content item, active
// grant that opens it). A bundle grant expands to the bundle's current items.
// The single definition of access — every check and every enrolment cohort
// reads this view, never the grants. Active matches the list status rule:
// revoked never counts, and a grant is expired once expires_at < now().
export const contentAccess = pgView("content_access", {
  orgId: text("org_id").notNull(),
  orgUserId: text("org_user_id").notNull(),
  contentId: text("content_id").notNull(),
  entitlementId: text("entitlement_id").notNull(),
  grantedAt: timestamp("granted_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
}).as(sql`
  select e.org_id, e.org_user_id, e.content_id, e.id as entitlement_id, e.granted_at, e.expires_at
  from entitlements e
  where e.content_id is not null
    and e.status = 'active'
    and (e.expires_at is null or e.expires_at >= now())
  union all
  select e.org_id, e.org_user_id, bi.content_id, e.id as entitlement_id, e.granted_at, e.expires_at
  from entitlements e
  join bundle_items bi on bi.org_id = e.org_id and bi.bundle_id = e.bundle_id
  where e.status = 'active'
    and (e.expires_at is null or e.expires_at >= now())
`);

type _EntitlementsDrift = Expect<NoDrift<typeof entitlements.$inferSelect, Entitlement>>;
