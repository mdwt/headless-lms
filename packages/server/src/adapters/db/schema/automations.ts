// automations tables — org-scoped automation definitions and their run
// history. `automations.actions` and `automation_runs.action_results` are
// ordered jsonb blobs (contract types owned by @headless-lms/types); a run's
// `event` is the triggering DomainEvent snapshot, stored verbatim.
import { pgTable, text, boolean, jsonb, timestamp, primaryKey, foreignKey, index } from 'drizzle-orm/pg-core';
import { genId } from '../../../core/shared/id.js';
import { organizations } from './organizations.js';
import type { AutomationAction, AutomationActionResult } from '@headless-lms/types';
import type { DomainEvent } from '../../../core/shared/ports.js';

export const automations = pgTable(
  'automations',
  {
    orgId: text('org_id')
      .notNull()
      .references(() => organizations.id),
    id: text('id')
      .notNull()
      .$defaultFn(() => genId('automation')),
    name: text('name').notNull(),
    description: text('description'),
    trigger: text('trigger').notNull(),
    actions: jsonb('actions').$type<AutomationAction[]>().notNull(),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.orgId, t.id] }),
    triggerIdx: index('automations_org_trigger_idx').on(t.orgId, t.trigger),
  }),
);

export const automationRuns = pgTable(
  'automation_runs',
  {
    orgId: text('org_id')
      .notNull()
      .references(() => organizations.id),
    id: text('id')
      .notNull()
      .$defaultFn(() => genId('automationRun')),
    automationId: text('automation_id').notNull(),
    trigger: text('trigger').notNull(),
    event: jsonb('event').$type<DomainEvent>().notNull(),
    status: text('status', { enum: ['running', 'completed', 'failed'] }).notNull(),
    actionResults: jsonb('action_results').$type<AutomationActionResult[]>().notNull().default([]),
    startedAt: timestamp('started_at').notNull(),
    finishedAt: timestamp('finished_at'),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.orgId, t.id] }),
    automationIdx: index('automation_runs_org_automation_idx').on(t.orgId, t.automationId),
    // Runs die with their automation: deleting the definition cascades to history.
    automationFk: foreignKey({
      columns: [t.orgId, t.automationId],
      foreignColumns: [automations.orgId, automations.id],
    }).onDelete('cascade'),
  }),
);
