// content tables — the content domain (owns all content types; today: course).
// Course type: Course → Module → Activity, where an Activity is the leaf sitting
// directly in a module. An Activity is UNIFORM content — the domain does not
// categorise it: a `seq`, and an opaque `settings` jsonb blob holding whatever
// that content needs (title, type, body, completion rule, …). Assets are the one
// thing kept OUT of the blob (owned by the assets domain) and linked via the
// many-to-many `activity_assets`. Org-scoped: composite (org_id, id) keys.
import {
  pgTable,
  text,
  integer,
  jsonb,
  timestamp,
  primaryKey,
  foreignKey,
  unique,
} from "drizzle-orm/pg-core";
import { genId } from "../../../core/shared/id.js";
import { organizations } from "./organizations.js";
import { assets } from "./assets.js";

export const courses = pgTable(
  "courses",
  {
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    id: text("id")
      .notNull()
      .$defaultFn(() => genId("course")),
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
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    id: text("id")
      .notNull()
      .$defaultFn(() => genId("module")),
    courseId: text("course_id").notNull(),
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

// The leaf, directly in a module. Uniform content: seq + opaque settings blob.
export const activities = pgTable(
  "activities",
  {
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    id: text("id")
      .notNull()
      .$defaultFn(() => genId("activity")),
    moduleId: text("module_id").notNull(),
    seq: integer("seq").notNull(),
    // Opaque per-activity blob: title, type, body, completion rule — whatever the
    // content needs. Assets are the one thing kept out of the blob.
    settings: jsonb("settings"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.orgId, t.id] }),
    moduleFk: foreignKey({
      columns: [t.orgId, t.moduleId],
      foreignColumns: [modules.orgId, modules.id],
    }),
    seqUq: unique().on(t.orgId, t.moduleId, t.seq),
  }),
);

// activity ↔ asset: many-to-many (an activity uses many assets; an asset can be
// reused by many activities). Assets owned by the assets domain, tracked here.
export const activityAssets = pgTable(
  "activity_assets",
  {
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    id: text("id")
      .notNull()
      .$defaultFn(() => genId("activityAsset")),
    activityId: text("activity_id").notNull(),
    assetId: text("asset_id").notNull(),
    seq: integer("seq").notNull().default(0),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.orgId, t.id] }),
    activityFk: foreignKey({
      columns: [t.orgId, t.activityId],
      foreignColumns: [activities.orgId, activities.id],
    }),
    assetFk: foreignKey({
      columns: [t.orgId, t.assetId],
      foreignColumns: [assets.orgId, assets.id],
    }),
    activityAssetUq: unique().on(t.orgId, t.activityId, t.assetId),
  }),
);
