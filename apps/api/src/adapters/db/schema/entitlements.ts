// entitlements tables. Org-scoped: composite (org_id, id) key. A student's access
// grant to a course. `status` is stored as active | revoked; "expired" is DERIVED
// at read time from `expiresAt` (avoids a cron to flip rows).
import { pgTable, uuid, text, integer, timestamp, primaryKey, foreignKey, unique } from "drizzle-orm/pg-core";
import { organizations } from "./organizations.js";
import { students } from "./identity.js";
import { courses } from "./courses.js";

export const entitlements = pgTable(
  "entitlements",
  {
    id: uuid("id").notNull().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id),
    courseId: uuid("course_id").notNull(),
    status: text("status").notNull().default("active"), // active | revoked
    source: text("source").notNull().default("manual"), // manual | import
    progressPercent: integer("progress_percent").notNull().default(0),
    grantedAt: timestamp("granted_at").notNull().defaultNow(),
    expiresAt: timestamp("expires_at"),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.orgId, t.id] }),
    courseFk: foreignKey({
      columns: [t.orgId, t.courseId],
      foreignColumns: [courses.orgId, courses.id],
    }),
    // One entitlement per (org, student, course).
    studentCourseUq: unique().on(t.orgId, t.studentId, t.courseId),
  }),
);
