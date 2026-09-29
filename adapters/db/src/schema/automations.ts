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
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { genId } from "@headless-lms/core/shared/id";
import { organizations } from "./organizations.js";
import type {
  Automation,
  AutomationAction,
  AutomationActionResult,
  AutomationRun,
} from "@headless-lms/core/schemas";
import type { DomainEvent } from "@headless-lms/core/shared/ports";
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
    rerunOf: text("rerun_of"),
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
    eventDedupeIdx: uniqueIndex("automation_runs_org_automation_event_idx")
      .on(t.orgId, t.automationId, t.eventId)
      .where(sql`${t.rerunOf} is null`),
  }),
);

type _AutomationsDrift = Expect<NoDrift<typeof automations.$inferSelect, Automation>>;
type _AutomationRunsDrift = Expect<NoDrift<typeof automationRuns.$inferSelect, AutomationRun>>;
