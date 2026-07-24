// automations — Drizzle repositories (implement the core outbound ports).
// Org-scoped: every method takes the domain `organizations.id` and constrains
// its queries to that tenant. `Automation`/`AutomationRun` carry no `orgId`
// column of their own in the domain type (mirrors the `Entitlement` shape) —
// `AutomationRun` is the one exception, since it's the run's own `orgId`
// field the service reads back off `handle`'s event.
import { and, asc, desc, eq, sql, type SQL } from 'drizzle-orm';
import type { DbExecutor } from '../index.js';
import type { AutomationRunsRepository, AutomationsRepository, NewAutomationRun } from '../../../core/automations/ports.js';
import type { Automation, AutomationRun, Page } from '../../../core/automations/model.js';
import type { AutomationRunsQuery, CreateAutomationInput, UpdateAutomationInput } from '../../../core/automations/types.js';
import { automations, automationRuns } from '../schema/index.js';
import type { Logger } from '../../../core/shared/ports.js';
import { noopLogger } from '../../../core/shared/logger.js';

const automationSelection = {
  id: automations.id,
  name: automations.name,
  description: automations.description,
  trigger: automations.trigger,
  actions: automations.actions,
  enabled: automations.enabled,
};

interface AutomationRow {
  id: string;
  name: string;
  description: string | null;
  trigger: string;
  actions: Automation['actions'];
  enabled: boolean;
}

function toAutomation(row: AutomationRow): Automation {
  return {
    id: row.id,
    name: row.name,
    ...(row.description !== null ? { description: row.description } : {}),
    trigger: row.trigger,
    actions: row.actions,
    enabled: row.enabled,
  };
}

export class DrizzleAutomationsRepository implements AutomationsRepository {
  constructor(
    private readonly db: DbExecutor,
    private readonly logger: Logger = noopLogger,
  ) {}

  async insert(orgId: string, input: CreateAutomationInput): Promise<Automation> {
    const [inserted] = await this.db
      .insert(automations)
      .values({
        orgId,
        name: input.name,
        description: input.description,
        trigger: input.trigger,
        actions: input.actions,
      })
      .returning({ id: automations.id });
    if (!inserted) {
      throw new Error('failed to insert automation');
    }
    const created = await this.findById(orgId, inserted.id);
    if (!created) {
      throw new Error('failed to load created automation');
    }
    return created;
  }

  async update(orgId: string, id: string, patch: UpdateAutomationInput): Promise<Automation | null> {
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.name !== undefined) {
      set.name = patch.name;
    }
    if (patch.description !== undefined) {
      set.description = patch.description;
    }
    if (patch.trigger !== undefined) {
      set.trigger = patch.trigger;
    }
    if (patch.actions !== undefined) {
      set.actions = patch.actions;
    }
    if (patch.enabled !== undefined) {
      set.enabled = patch.enabled;
    }

    const [updated] = await this.db
      .update(automations)
      .set(set)
      .where(and(eq(automations.orgId, orgId), eq(automations.id, id)))
      .returning({ id: automations.id });
    if (!updated) {
      return null;
    }
    return this.findById(orgId, id);
  }

  async delete(orgId: string, id: string): Promise<Automation | null> {
    const [deleted] = await this.db
      .delete(automations)
      .where(and(eq(automations.orgId, orgId), eq(automations.id, id)))
      .returning(automationSelection);
    return deleted ? toAutomation(deleted) : null;
  }

  async findById(orgId: string, id: string): Promise<Automation | null> {
    const [row] = await this.db
      .select(automationSelection)
      .from(automations)
      .where(and(eq(automations.orgId, orgId), eq(automations.id, id)))
      .limit(1);
    return row ? toAutomation(row) : null;
  }

  async listByOrg(orgId: string): Promise<Automation[]> {
    const rows = await this.db
      .select(automationSelection)
      .from(automations)
      .where(eq(automations.orgId, orgId))
      .orderBy(desc(automations.createdAt));
    return rows.map(toAutomation);
  }

  async listByTrigger(orgId: string, trigger: string): Promise<Automation[]> {
    const rows = await this.db
      .select(automationSelection)
      .from(automations)
      .where(and(eq(automations.orgId, orgId), eq(automations.trigger, trigger)))
      .orderBy(desc(automations.createdAt));
    return rows.map(toAutomation);
  }
}

const runSelection = {
  id: automationRuns.id,
  orgId: automationRuns.orgId,
  automationId: automationRuns.automationId,
  trigger: automationRuns.trigger,
  event: automationRuns.event,
  status: automationRuns.status,
  actionResults: automationRuns.actionResults,
  startedAt: automationRuns.startedAt,
  finishedAt: automationRuns.finishedAt,
};

interface RunRow {
  id: string;
  orgId: string;
  automationId: string;
  trigger: string;
  event: AutomationRun['event'];
  status: AutomationRun['status'];
  actionResults: AutomationRun['actionResults'];
  startedAt: Date;
  finishedAt: Date | null;
}

function toAutomationRun(row: RunRow): AutomationRun {
  return {
    id: row.id,
    orgId: row.orgId,
    automationId: row.automationId,
    trigger: row.trigger,
    event: row.event,
    status: row.status,
    actionResults: row.actionResults,
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt ? row.finishedAt.toISOString() : null,
  };
}

// Sortable columns by the client-facing field name. `-field` = desc.
const sortColumns = {
  startedAt: automationRuns.startedAt,
  finishedAt: automationRuns.finishedAt,
  status: automationRuns.status,
} as const;

export class DrizzleAutomationRunsRepository implements AutomationRunsRepository {
  constructor(
    private readonly db: DbExecutor,
    private readonly logger: Logger = noopLogger,
  ) {}

  async insert(orgId: string, run: NewAutomationRun): Promise<AutomationRun | null> {
    const [inserted] = await this.db
      .insert(automationRuns)
      .values({
        orgId,
        automationId: run.automationId,
        trigger: run.trigger,
        eventId: run.event.id,
        event: run.event,
        status: run.status,
        actionResults: run.actionResults,
        startedAt: new Date(run.startedAt),
        finishedAt: run.finishedAt ? new Date(run.finishedAt) : null,
      })
      // A redelivered trigger event hits the unique (org, automation, event) index; no row comes back.
      .onConflictDoNothing({
        target: [automationRuns.orgId, automationRuns.automationId, automationRuns.eventId],
      })
      .returning(runSelection);
    return inserted ? toAutomationRun(inserted) : null;
  }

  async recordOutcome(
    orgId: string,
    id: string,
    outcome: {
      status: AutomationRun['status'];
      actionResults: AutomationRun['actionResults'];
      finishedAt: string;
    },
  ): Promise<AutomationRun | null> {
    const [updated] = await this.db
      .update(automationRuns)
      .set({
        status: outcome.status,
        actionResults: outcome.actionResults,
        finishedAt: new Date(outcome.finishedAt),
      })
      .where(and(eq(automationRuns.orgId, orgId), eq(automationRuns.id, id)))
      .returning(runSelection);
    return updated ? toAutomationRun(updated) : null;
  }

  async list(orgId: string, automationId: string, query: AutomationRunsQuery): Promise<Page<AutomationRun>> {
    const conditions: SQL[] = [
      eq(automationRuns.orgId, orgId),
      eq(automationRuns.automationId, automationId),
    ];
    if (query.status) {
      conditions.push(eq(automationRuns.status, query.status));
    }
    const where = and(...conditions);

    // Sort: `-field` for descending; default to most-recently started first.
    let orderBy: SQL;
    if (query.sort) {
      const isDesc = query.sort.startsWith('-');
      const field = (isDesc ? query.sort.slice(1) : query.sort) as keyof typeof sortColumns;
      const col = sortColumns[field] ?? automationRuns.startedAt;
      orderBy = isDesc ? desc(col) : asc(col);
    } else {
      orderBy = desc(automationRuns.startedAt);
    }

    const offset = (query.page - 1) * query.pageSize;

    const rows = await this.db
      .select(runSelection)
      .from(automationRuns)
      .where(where)
      .orderBy(orderBy)
      .limit(query.pageSize)
      .offset(offset);

    const [{ total } = { total: 0 }] = await this.db
      .select({ total: sql<number>`cast(count(*) as int)` })
      .from(automationRuns)
      .where(where);

    return {
      rows: rows.map(toAutomationRun),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }
}
