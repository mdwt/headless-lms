// automations tables — org-scoped automation definitions and their run
// history. `automations.actions` and `automation_runs.action_results` are
// ordered jsonb blobs (contract types owned by @headless-lms/core/types); a run's
// `event` is the triggering DomainEvent snapshot, stored verbatim.
import {
  pgTable,
  text,
  boolean,
  jsonb,
  timestamp,
  primaryKey,
  foreignKey,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { desc, sql } from "drizzle-orm";
import { genId } from "@headless-lms/core/shared/id";
import { organizations, orgUsers } from "./organizations.js";
import { communities, spaces } from "./content.js";
import type {
  Automation,
  AutomationAction,
  AutomationActionResult,
  AutomationRun,
} from "@headless-lms/core/schemas";
import type { DomainEvent, JsonValue } from "@headless-lms/core/shared/ports";
import type { Reason } from "@headless-lms/core/types";
import type { Expect, NoDrift } from "./drift.js";

export const automations = pgTable(
  "automations",
  {
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    id: text("id")
      .notNull()
      .$defaultFn(() => genId("automation")),
    name: text("name").notNull(),
    kind: text("kind", { enum: ["workflow", "webhook"] })
      .notNull()
      .default("workflow"),
    description: text("description"),
    triggers: text("triggers").array().notNull(),
    actions: jsonb("actions").$type<AutomationAction[]>().notNull(),
    enabled: boolean("enabled").notNull().default(true),
    filter: jsonb("filter").$type<Automation["filter"]>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.orgId, t.id] }),
    triggersIdx: index("automations_triggers_idx").using("gin", t.triggers),
  }),
);

export const automationRuns = pgTable(
  "automation_runs",
  {
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    id: text("id")
      .notNull()
      .$defaultFn(() => genId("automationRun")),
    automationId: text("automation_id").notNull(),
    trigger: text("trigger").notNull(),
    // At-least-once dedupe key for the triggering event; DB-internal, not part of the domain `AutomationRun` type.
    eventId: text("event_id").notNull(),
    event: jsonb("event").$type<DomainEvent>().notNull(),
    status: text("status", { enum: ["running", "completed", "failed"] }).notNull(),
    actionResults: jsonb("action_results").$type<AutomationActionResult[]>().notNull().default([]),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.orgId, t.id] }),
    automationIdx: index("automation_runs_org_automation_idx").on(t.orgId, t.automationId),
    eventDedupeIdx: uniqueIndex("automation_runs_org_automation_event_idx").on(
      t.orgId,
      t.automationId,
      t.eventId,
    ),
  }),
);

export const notifications = pgTable(
  "notifications",
  {
    orgId: text("org_id").notNull(),
    id: text("id")
      .notNull()
      .$defaultFn(() => genId("notification")),
    userId: text("user_id").notNull(),
    sourceEventId: text("source_event_id"),
    type: text("type").notNull(),
    scope: text("scope", { enum: ["org", "community", "space", "chat"] }).notNull(),
    reasons: text("reasons").array().$type<Reason[]>().notNull(),
    matchedReason: text("matched_reason").$type<Reason>().notNull(),
    category: text("category").notNull(),
    communityId: text("community_id"),
    spaceId: text("space_id"),
    actorOrgUserId: text("actor_org_user_id"),
    subjectType: text("subject_type"),
    subjectId: text("subject_id"),
    parentType: text("parent_type"),
    parentId: text("parent_id"),
    display: jsonb("display").$type<Record<string, JsonValue>>().notNull(),
    inApp: boolean("in_app").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    readAt: timestamp("read_at", { withTimezone: true }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.orgId, t.id] }),
    userFk: foreignKey({
      columns: [t.orgId, t.userId],
      foreignColumns: [orgUsers.orgId, orgUsers.userId],
    }).onDelete("cascade"),
    communityFk: foreignKey({
      columns: [t.orgId, t.communityId],
      foreignColumns: [communities.orgId, communities.id],
    }).onDelete("cascade"),
    spaceFk: foreignKey({
      columns: [t.orgId, t.spaceId],
      foreignColumns: [spaces.orgId, spaces.id],
    }).onDelete("cascade"),
    sourceIdx: uniqueIndex("notifications_source_event_idx")
      .on(t.orgId, t.sourceEventId, t.userId, sql`coalesce(${t.communityId}, '')`)
      .where(sql`${t.sourceEventId} is not null`),
    listIdx: index("notifications_list_idx")
      .on(t.orgId, t.userId, desc(t.createdAt), desc(t.id))
      .where(sql`${t.inApp}`),
    communityIdx: index("notifications_community_idx").on(t.orgId, t.userId, t.communityId),
    categoryIdx: index("notifications_category_idx").on(t.orgId, t.userId, t.category),
    reasonsIdx: index("notifications_reasons_idx").using("gin", t.reasons),
  }),
);

export const notificationDeliveries = pgTable(
  "notification_deliveries",
  {
    orgId: text("org_id").notNull(),
    id: text("id")
      .notNull()
      .$defaultFn(() => genId("notificationDelivery")),
    notificationId: text("notification_id").notNull(),
    channel: text("channel").notNull(),
    status: text("status", { enum: ["pending", "sent", "failed"] })
      .notNull()
      .default("pending"),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.orgId, t.id] }),
    notificationFk: foreignKey({
      columns: [t.orgId, t.notificationId],
      foreignColumns: [notifications.orgId, notifications.id],
    }).onDelete("cascade"),
    channelIdx: uniqueIndex("notification_deliveries_channel_idx").on(
      t.orgId,
      t.notificationId,
      t.channel,
    ),
  }),
);

type _AutomationsDrift = Expect<NoDrift<typeof automations.$inferSelect, Automation>>;
type _AutomationRunsDrift = Expect<NoDrift<typeof automationRuns.$inferSelect, AutomationRun>>;
