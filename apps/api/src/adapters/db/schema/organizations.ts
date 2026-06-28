// organizations tables — the domain mirror of the auth adapter's organization
// plugin. `organizations` is the tenant root (every org-scoped table FKs to it);
// memberships and invitations carry a composite (org_id, id) key.
import { pgTable, uuid, text, timestamp, primaryKey, foreignKey, unique } from "drizzle-orm/pg-core";
import { students } from "./identity.js";
import { courses } from "./courses.js";

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Links to the better-auth organization record.
  authOrgId: text("auth_org_id").notNull().unique(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  ownerStudentId: uuid("owner_student_id")
    .notNull()
    .references(() => students.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").notNull().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id),
    role: text("role").notNull(),
    authMemberId: text("auth_member_id").notNull().unique(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.orgId, t.id] }) }),
);

export const invitations = pgTable(
  "invitations",
  {
    id: uuid("id").notNull().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    email: text("email").notNull(),
    role: text("role").notNull(),
    status: text("status").notNull(),
    inviterStudentId: uuid("inviter_student_id")
      .notNull()
      .references(() => students.id),
    authInvitationId: text("auth_invitation_id").notNull().unique(),
    expiresAt: timestamp("expires_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.orgId, t.id] }) }),
);

export const courseAssignments = pgTable(
  "course_assignments",
  {
    id: uuid("id").notNull().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    membershipId: uuid("membership_id").notNull(),
    courseId: uuid("course_id").notNull(),
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
