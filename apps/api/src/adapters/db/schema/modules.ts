// modules tables (`modules`, `module_items`) — owned by the `courses` context.
// Curriculum structure under a course, org-scoped with composite (org_id, id)
// keys. A module has ordered items; each item is a lesson or an assessment
// (discriminated by `kind`).
import { pgTable, uuid, text, integer, boolean, primaryKey, foreignKey } from "drizzle-orm/pg-core";
import { organizations } from "./organizations.js";
import { courses } from "./courses.js";

export const modules = pgTable(
  "modules",
  {
    id: uuid("id").notNull().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    courseId: uuid("course_id").notNull(),
    title: text("title").notNull(),
    order: integer("order").notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.orgId, t.id] }),
    courseFk: foreignKey({
      columns: [t.orgId, t.courseId],
      foreignColumns: [courses.orgId, courses.id],
    }),
  }),
);

export const moduleItems = pgTable(
  "module_items",
  {
    id: uuid("id").notNull().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    moduleId: uuid("module_id").notNull(),
    kind: text("kind").notNull(), // lesson | assessment
    title: text("title").notNull(),
    order: integer("order").notNull(),
    // For a lesson: video|text|pdf|audio|download|embed. For an assessment: quiz|assignment.
    type: text("type").notNull(),
    durationLabel: text("duration_label"),
    assetId: uuid("asset_id"),
    questionCount: integer("question_count"),
    pointsPossible: integer("points_possible"),
    published: boolean("published").notNull().default(false),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.orgId, t.id] }),
    moduleFk: foreignKey({
      columns: [t.orgId, t.moduleId],
      foreignColumns: [modules.orgId, modules.id],
    }),
  }),
);
