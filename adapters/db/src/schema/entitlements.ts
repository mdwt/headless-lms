import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  primaryKey,
  foreignKey,
  unique,
  index,
  check,
} from "drizzle-orm/pg-core";
import type { Entitlement, SpaceMember } from "@headless-lms/core/schemas";
import { genId } from "@headless-lms/core/shared/id";
import { organizations, orgUsers } from "./organizations.js";
import { bundles, communities, contentItems, spaces } from "./content.js";
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

export const spaceMembers = pgTable(
  "space_members",
  {
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    id: text("id")
      .notNull()
      .$defaultFn(() => genId("spaceMember")),
    communityId: text("community_id").notNull(),
    spaceId: text("space_id").notNull(),
    orgUserId: text("org_user_id").notNull(),
    status: text("status", { enum: ["requested", "invited", "active", "revoked"] }).notNull(),
    source: text("source", { enum: ["request", "invite", "manual"] })
      .notNull()
      .default("request"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.orgId, t.id] }),
    memberUq: unique().on(t.orgId, t.spaceId, t.orgUserId),
    communityFk: foreignKey({
      columns: [t.orgId, t.communityId],
      foreignColumns: [communities.orgId, communities.id],
    }).onDelete("cascade"),
    spaceFk: foreignKey({
      columns: [t.orgId, t.spaceId, t.communityId],
      foreignColumns: [spaces.orgId, spaces.id, spaces.communityId],
    }).onDelete("cascade"),
    orgUserFk: foreignKey({
      columns: [t.orgId, t.orgUserId],
      foreignColumns: [orgUsers.orgId, orgUsers.id],
    }).onDelete("cascade"),
    spaceIdx: index("space_members_space_idx").on(t.orgId, t.spaceId, t.status),
    communityIdx: index("space_members_community_idx").on(t.orgId, t.communityId),
  }),
);

export const entitlementNotices = pgTable(
  "entitlement_notices",
  {
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    entitlementId: text("entitlement_id").notNull(),
    kind: text("kind", { enum: ["expired", "ending_soon"] }).notNull(),
    communityId: text("community_id").notNull().default(""),
    notifiedAt: timestamp("notified_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.orgId, t.entitlementId, t.kind, t.communityId] }),
    entitlementFk: foreignKey({
      columns: [t.orgId, t.entitlementId],
      foreignColumns: [entitlements.orgId, entitlements.id],
    }).onDelete("cascade"),
  }),
);

type _EntitlementsDrift = Expect<NoDrift<typeof entitlements.$inferSelect, Entitlement>>;
type _SpaceMembersDrift = Expect<NoDrift<typeof spaceMembers.$inferSelect, SpaceMember>>;
