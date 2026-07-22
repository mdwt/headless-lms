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
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { genId } from '../../../core/shared/id.js';
import { organizations } from './organizations.js';
import { assets } from './assets.js';

// The content registry (supertype table): one row per piece of content, any
// type. A concrete content table shares its PK with a registry row (same id)
// and references it via a type-pinned composite FK; the generic entitlements
// table FKs here, so it never changes when a content type is added. Deletes go
// through this table (cascade to the concrete row and the grants).
export const contentItems = pgTable(
  'content_items',
  {
    orgId: text('org_id')
      .notNull()
      .references(() => organizations.id),
    id: text('id').notNull(),
    type: text('type', { enum: ['course'] }).notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.orgId, t.id] }),
    // FK target for type-pinned references from concrete content tables.
    typeUq: unique().on(t.orgId, t.id, t.type),
    // Widened per new content type.
    typeCk: check('content_items_type_check', sql`${t.type} in ('course')`),
  }),
);

export const courses = pgTable(
  'courses',
  {
    orgId: text('org_id')
      .notNull()
      .references(() => organizations.id),
    id: text('id')
      .notNull()
      .$defaultFn(() => genId('course')),
    // Pinned to 'course' so the composite FK below cannot attach this row to a
    // registry row of another content type.
    type: text('type')
      .notNull()
      .generatedAlwaysAs(sql`'course'`),
    title: text('title').notNull(),
    slug: text('slug').notNull(),
    description: text('description').notNull().default(''),
    status: text('status', { enum: ['draft', 'published'] })
      .notNull()
      .default('draft'),
    category: text('category').notNull().default(''),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.orgId, t.id] }),
    slugUq: unique().on(t.orgId, t.slug),
    contentItemFk: foreignKey({
      columns: [t.orgId, t.id, t.type],
      foreignColumns: [contentItems.orgId, contentItems.id, contentItems.type],
    }).onDelete('cascade'),
  }),
);

export const modules = pgTable(
  'modules',
  {
    orgId: text('org_id')
      .notNull()
      .references(() => organizations.id),
    id: text('id')
      .notNull()
      .$defaultFn(() => genId('module')),
    courseId: text('course_id').notNull(),
    title: text('title').notNull(),
    seq: integer('seq').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.orgId, t.id] }),
    // Modules are part of the course aggregate: deleting the course deletes them.
    courseFk: foreignKey({
      columns: [t.orgId, t.courseId],
      foreignColumns: [courses.orgId, courses.id],
    }).onDelete('cascade'),
  }),
);

// The leaf, directly in a module. Uniform content: seq + opaque settings blob.
export const activities = pgTable(
  'activities',
  {
    orgId: text('org_id')
      .notNull()
      .references(() => organizations.id),
    id: text('id')
      .notNull()
      .$defaultFn(() => genId('activity')),
    moduleId: text('module_id').notNull(),
    seq: integer('seq').notNull(),
    // Opaque per-activity blob: title, type, body, completion rule — whatever the
    // content needs. Assets are the one thing kept out of the blob.
    settings: jsonb('settings'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.orgId, t.id] }),
    moduleFk: foreignKey({
      columns: [t.orgId, t.moduleId],
      foreignColumns: [modules.orgId, modules.id],
    }).onDelete('cascade'),
    seqUq: unique().on(t.orgId, t.moduleId, t.seq),
  }),
);

// activity ↔ asset: many-to-many (an activity uses many assets; an asset can be
// reused by many activities). Assets owned by the assets domain, tracked here.
export const activityAssets = pgTable(
  'activity_assets',
  {
    orgId: text('org_id')
      .notNull()
      .references(() => organizations.id),
    id: text('id')
      .notNull()
      .$defaultFn(() => genId('activityAsset')),
    activityId: text('activity_id').notNull(),
    assetId: text('asset_id').notNull(),
    seq: integer('seq').notNull().default(0),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.orgId, t.id] }),
    // The link cascades with its activity; the asset itself is owned by the
    // assets domain and survives (assetFk stays restrictive).
    activityFk: foreignKey({
      columns: [t.orgId, t.activityId],
      foreignColumns: [activities.orgId, activities.id],
    }).onDelete('cascade'),
    assetFk: foreignKey({
      columns: [t.orgId, t.assetId],
      foreignColumns: [assets.orgId, assets.id],
    }),
    activityAssetUq: unique().on(t.orgId, t.activityId, t.assetId),
  }),
);
