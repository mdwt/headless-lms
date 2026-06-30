// courses tables — the curriculum aggregate, owned by the `courses` context.
// Course (root) → Module → ordered contents. `lessons` and `assessments` are the
// content entities; `module_items` is an ORDERABLE LINK table that places one of
// them in a module at a `seq` (it owns ordering, not content). Org-scoped:
// composite (org_id, id) keys throughout.
// Who teaches a course is NOT held here — that is `course_assignments`
// (organizations), which scopes an instructor's membership to a course.
import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  jsonb,
  timestamp,
  primaryKey,
  foreignKey,
  unique,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizations } from "./organizations.js";
import { assets } from "./assets.js";

export const courses = pgTable(
  "courses",
  {
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    id: uuid("id").notNull().defaultRandom(),
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    description: text("description").notNull().default(""),
    status: text("status", { enum: ["draft", "published"] })
      .notNull()
      .default("draft"),
    category: text("category").notNull().default(""),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.orgId, t.id] }),
    slugUq: unique().on(t.orgId, t.slug),
  }),
);

export const modules = pgTable(
  "modules",
  {
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    id: uuid("id").notNull().defaultRandom(),
    courseId: uuid("course_id").notNull(),
    title: text("title").notNull(),
    seq: integer("seq").notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.orgId, t.id] }),
    courseFk: foreignKey({
      columns: [t.orgId, t.courseId],
      foreignColumns: [courses.orgId, courses.id],
    }),
  }),
);

export const lessons = pgTable(
  "lessons",
  {
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    id: uuid("id").notNull().defaultRandom(),
    type: text("type", {
      enum: ["video", "text", "pdf", "audio", "download", "embed"],
    }).notNull(),
    title: text("title").notNull(),
    // Opaque per-lesson blob: type-specific content payload, completion rule, and
    // any other settings. Shape is determined by `type` and validated at the app
    // boundary — the DB does not model its fields.
    settings: jsonb("settings"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({ pk: primaryKey({ columns: [t.orgId, t.id] }) }),
);

export const assessments = pgTable(
  "assessments",
  {
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    id: uuid("id").notNull().defaultRandom(),
    type: text("type", { enum: ["quiz", "assignment"] }).notNull(),
    title: text("title").notNull(),
    questionCount: integer("question_count"),
    pointsPossible: integer("points_possible"),
    published: boolean("published").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({ pk: primaryKey({ columns: [t.orgId, t.id] }) }),
);

// Orderable link table: places a lesson OR an assessment in a module at a `seq`.
export const moduleItems = pgTable(
  "module_items",
  {
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    id: uuid("id").notNull().defaultRandom(),
    moduleId: uuid("module_id").notNull(),
    seq: integer("seq").notNull(),
    kind: text("kind", { enum: ["lesson", "assessment"] }).notNull(),
    lessonId: uuid("lesson_id"),
    assessmentId: uuid("assessment_id"),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.orgId, t.id] }),
    moduleFk: foreignKey({
      columns: [t.orgId, t.moduleId],
      foreignColumns: [modules.orgId, modules.id],
    }),
    lessonFk: foreignKey({
      columns: [t.orgId, t.lessonId],
      foreignColumns: [lessons.orgId, lessons.id],
    }),
    assessmentFk: foreignKey({
      columns: [t.orgId, t.assessmentId],
      foreignColumns: [assessments.orgId, assessments.id],
    }),
    // ordering is unique within a module
    seqUq: unique().on(t.orgId, t.moduleId, t.seq),
    // exactly one target is set
    oneTarget: check(
      "module_items_one_target",
      sql`(lesson_id IS NOT NULL) <> (assessment_id IS NOT NULL)`,
    ),
  }),
);

// lesson ↔ asset is many-to-many: a lesson uses many assets (e.g. a video plus
// captions plus a downloadable file), and an asset can be reused by many lessons.
export const lessonAssets = pgTable(
  "lesson_assets",
  {
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    id: uuid("id").notNull().defaultRandom(),
    lessonId: uuid("lesson_id").notNull(),
    assetId: uuid("asset_id").notNull(),
    seq: integer("seq").notNull().default(0),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.orgId, t.id] }),
    lessonFk: foreignKey({
      columns: [t.orgId, t.lessonId],
      foreignColumns: [lessons.orgId, lessons.id],
    }),
    assetFk: foreignKey({
      columns: [t.orgId, t.assetId],
      foreignColumns: [assets.orgId, assets.id],
    }),
    lessonAssetUq: unique().on(t.orgId, t.lessonId, t.assetId),
  }),
);
