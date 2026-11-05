import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  boolean,
  jsonb,
  timestamp,
  foreignKey,
  unique,
  uniqueIndex,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";
import type { OrgRoleRow, RoleAssignment } from "@headless-lms/core/schemas";
import { genId } from "@headless-lms/core/shared/id";
import { organizations, orgUsers } from "./organizations.js";
import { contentItems } from "./content.js";
import type { Expect, NoDrift } from "./drift.js";

export const orgRoles = pgTable(
  "org_roles",
  {
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    id: text("id")
      .notNull()
      .$defaultFn(() => genId("orgRole")),
    key: text("key").notNull(),
    name: text("name"),
    description: text("description"),
    base: text("base").notNull(),
    levels: text("levels", { enum: ["org", "course", "download", "community"] }).array(),
    permissions: jsonb("permissions").$type<Record<string, boolean>>().notNull().default({}),
    team: boolean("team"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.orgId, t.id] }),
    keyUq: unique("org_roles_key_uq").on(t.orgId, t.key),
    nameUq: uniqueIndex("org_roles_name_uq")
      .on(t.orgId, sql`lower(${t.name})`)
      .where(sql`${t.name} is not null`),
  }),
);

export const roleAssignments = pgTable(
  "role_assignments",
  {
    orgId: text("org_id").notNull(),
    id: text("id")
      .notNull()
      .$defaultFn(() => genId("roleAssignment")),
    orgUserId: text("org_user_id").notNull(),
    roleKey: text("role_key").notNull(),
    contentId: text("content_id"),
    contentType: text("content_type", { enum: ["course", "download", "community"] }),
    assignedBy: text("assigned_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.orgId, t.id] }),
    orgUserFk: foreignKey({
      name: "role_assignments_org_user_fk",
      columns: [t.orgId, t.orgUserId],
      foreignColumns: [orgUsers.orgId, orgUsers.id],
    }).onDelete("cascade"),
    contentFk: foreignKey({
      name: "role_assignments_content_fk",
      columns: [t.orgId, t.contentId, t.contentType],
      foreignColumns: [contentItems.orgId, contentItems.id, contentItems.type],
    }).onDelete("cascade"),
    scopeUq: unique("role_assignments_scope_uq")
      .on(t.orgId, t.orgUserId, t.contentId)
      .nullsNotDistinct(),
    ownerUq: uniqueIndex("role_assignments_owner_uq")
      .on(t.orgId)
      .where(sql`${t.roleKey} = 'owner'`),
    contentIdx: index("role_assignments_content_idx").on(t.orgId, t.contentId),
  }),
);

type _OrgRolesDrift = Expect<NoDrift<typeof orgRoles.$inferSelect, OrgRoleRow>>;
type _RoleAssignmentsDrift = Expect<NoDrift<typeof roleAssignments.$inferSelect, RoleAssignment>>;
