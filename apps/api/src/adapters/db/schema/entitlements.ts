// enrollments table. Org-scoped: composite (org_id, id) key.
// The learner↔course access grant — for a Student (the learner identity), not a
// staff User. `status` is stored as active | revoked; "expired" is DERIVED at
// read time from `expiresAt` (no cron to flip rows). Completion is NOT held
// here — it belongs to progress and is composed at access-resolution time.
import { pgTable, text, timestamp, primaryKey, foreignKey, unique } from "drizzle-orm/pg-core";
import { genId } from "../../../core/shared/id.js";
import { organizations } from "./organizations.js";
import { students } from "./identity.js";
import { courses } from "./content.js";

export const enrollments = pgTable(
  "enrollments",
  {
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    id: text("id")
      .notNull()
      .$defaultFn(() => genId("enrollment")),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id),
    courseId: text("course_id").notNull(),
    status: text("status", { enum: ["active", "revoked"] })
      .notNull()
      .default("active"),
    source: text("source", { enum: ["manual", "import"] })
      .notNull()
      .default("manual"),
    grantedAt: timestamp("granted_at").notNull().defaultNow(),
    expiresAt: timestamp("expires_at"), // null = lifetime
  },
  (t) => ({
    pk: primaryKey({ columns: [t.orgId, t.id] }),
    courseFk: foreignKey({
      columns: [t.orgId, t.courseId],
      foreignColumns: [courses.orgId, courses.id],
    }),
    // One grant per (org, student, course).
    studentCourseUq: unique().on(t.orgId, t.studentId, t.courseId),
  }),
);
