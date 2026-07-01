// organizations tables — the domain mirror of the auth adapter's organization
// plugin. `organizations` is the tenant root (every org-scoped table FKs to it);
// memberships and invitations carry a composite (org_id, id) key.
import { pgTable, text, timestamp, primaryKey, foreignKey, unique } from "drizzle-orm/pg-core";
import { genId } from "../../../core/shared/id.js";
import { users } from "./identity.js";
import { courses } from "./content.js";

export const organizations = pgTable("organizations", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => genId("organization")),
  // Links to the better-auth organization record.
  externalId: text("external_id").notNull().unique(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const memberships = pgTable(
  "memberships",
  {
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    id: text("id")
      .notNull()
      .$defaultFn(() => genId("membership")),

    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    role: text("role", { enum: ["owner", "admin", "instructor"] }).notNull(),
    externalId: text("external_id").notNull().unique(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.orgId, t.id] }) }),
);

export const invitations = pgTable(
  "invitations",
  {
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    id: text("id")
      .notNull()
      .$defaultFn(() => genId("invitation")),
    email: text("email").notNull(),
    role: text("role", { enum: ["owner", "admin", "instructor"] }).notNull(),
    status: text("status", {
      enum: ["pending", "accepted", "rejected", "canceled"],
    }).notNull(),
    invetedBy: text("invited_by")
      .notNull()
      .references(() => users.id),
    authInvitationId: text("auth_invitation_id").notNull().unique(),
    expiresAt: timestamp("expires_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.orgId, t.id] }) }),
);

export const courseAssignments = pgTable(
  "course_assignments",
  {
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    id: text("id")
      .notNull()
      .$defaultFn(() => genId("courseAssignment")),
    membershipId: text("membership_id").notNull(),
    courseId: text("course_id").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.orgId, t.id] }),
    uniqueAssignment: unique().on(t.orgId, t.membershipId, t.courseId),
    membershipFk: foreignKey({
      columns: [t.orgId, t.membershipId],
      foreignColumns: [memberships.orgId, memberships.id],
    }),
    courseFk: foreignKey({
      columns: [t.orgId, t.courseId],
      foreignColumns: [courses.orgId, courses.id],
    }),
  }),
);
