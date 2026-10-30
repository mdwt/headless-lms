// automations context — service implementation (inbound port) and the
// AutomationExecutor the engine drives.
//
// `handle` is subscribed to all events on the EventBus: it matches an event
// against enabled automations for its trigger, opens one run per match, and
// hands it to the injected AutomationEngine, which calls back into
// `runAction`/`finalize`.
import {
  catalogActions,
  catalogTriggers,
  DELIVER_WEBHOOK_ACTION,
  publicDataSchema,
} from './catalog.js';
import { executeAction, type ActionOutcome } from './actions.js';
import { generateWebhookSecret } from './webhook-signing.js';
import type { CommunityMailReads, GrantWriter, ScheduledWork } from './community-mail.js';
import type { NotificationDesk } from '../identity/index.js';
import { communitySeeds, orgSeeds, type SeedAutomation } from './seeds.js';
import { cronSupported } from './schedule.js';
import {
  ActionFailedError,
  AutomationKindMismatchError,
  InvalidTriggerError,
  ReservedActionError,
  type Automation,
  type AutomationAction,
  type AutomationActionResult,
  type AutomationRun,
  type CreatedWebhook,
  type DeliverWebhookInput,
  type Page,
  type Webhook,
  type WebhookSecret,
} from './model.js';
import type {
  AutomationRunsQuery,
  AutomationsQuery,
  AvailableActions,
  AvailableTriggers,
  CreateAutomationInput,
  CreateWebhookInput,
  UpdateAutomationInput,
  UpdateWebhookInput,
} from './types.js';
import type {
  AutomationDispatch,
  AutomationEngine,
  AutomationExecutor,
  AutomationRunsRepository,
  AutomationsRepository,
  AutomationsService,
  AutomationsUnitOfWork,
  WebhookSender,
} from './ports.js';
import type { CredentialStore, DomainEvent, Logger } from '../shared/ports.js';
import type { JsonValue, ScheduledAutomation } from '../types/index.js';
import { deliverWebhookInputSchema } from '../types/schemas/index.js';
import { ConflictError, NotFoundError } from '../shared/errors.js';
import { noopLogger } from '../shared/logger.js';
import type { Mailer, MailerLookups } from '../shared/mailer.js';
import type { IntegrationsService } from '../integrations/index.js';
import { automationEvents } from './events.js';

/** True only when `input` sets `enabled` and nothing else — emits automation.enabled|disabled instead of automation.updated. */
function isEnabledOnlyUpdate<T extends { enabled?: boolean }>(
  input: T,
): input is T & { enabled: boolean } {
  if (input.enabled === undefined) {
    return false;
  }
  const { enabled: _enabled, ...rest } = input;
  return Object.values(rest).every((v) => v === undefined);
}

function floorMinute(at: Date): number {
  const copy = new Date(at);
  copy.setUTCSeconds(0, 0);
  return copy.getTime();
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function recordString(value: unknown, key: string): string | null {
  if (typeof value !== 'object' || value === null || !(key in value)) {
    return null;
  }
  const found = (value as Record<string, unknown>)[key];
  return typeof found === 'string' ? found : null;
}

function filterMatches(filter: Record<string, JsonValue> | null, data: unknown): boolean {
  if (filter == null) {
    return true;
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return false;
  }
  const record = data as Record<string, unknown>;
  return Object.entries(filter).every(([key, expected]) => {
    if (!Object.prototype.hasOwnProperty.call(record, key)) {
      return false;
    }
    return JSON.stringify(record[key]) === JSON.stringify(expected);
  });
}

function assertAuthorableTriggers(triggers: string[]): void {
  for (const trigger of triggers) {
    if (trigger.startsWith('automation.')) {
      throw new InvalidTriggerError(trigger);
    }
    if (trigger.startsWith('schedule:') && !cronSupported(trigger.slice('schedule:'.length))) {
      throw new InvalidTriggerError(trigger, 'schedule');
    }
  }
}

function assertCatalogTriggers(triggers: string[], schedules: boolean): void {
  assertAuthorableTriggers(triggers);
  const known = new Set(catalogTriggers().map((t) => t.type));
  for (const trigger of triggers) {
    if (!(schedules && trigger.startsWith('schedule:')) && !known.has(trigger)) {
      throw new InvalidTriggerError(trigger, 'unknown');
    }
  }
}

function assertAuthorableActions(actions: AutomationAction[]): void {
  for (const action of actions) {
    if (action.type === DELIVER_WEBHOOK_ACTION) {
      throw new ReservedActionError(action.type);
    }
  }
}

const SCHEDULE_FIRED = 'automation.schedule.fired';

function publicEventData(event: DomainEvent): JsonValue {
  const parsed =
    event.type === SCHEDULE_FIRED
      ? { success: true as const, data: event.data }
      : publicDataSchema(event.type)?.safeParse(event.data);
  return parsed?.success ? (JSON.parse(JSON.stringify(parsed.data)) as JsonValue) : null;
}

/** A run as callers see it: its event carries only what a webhook of that event would. */
function toRunView(run: AutomationRun): AutomationRun {
  const { type, version, id, orgId, occurredAt } = run.event;
  return {
    ...run,
    event: { type, version, id, orgId, occurredAt, data: publicEventData(run.event) },
  };
}

/** An automation as callers see it: a webhook's credential reference stays internal. */
function toAutomationView(automation: Automation): Automation {
  return {
    ...automation,
    actions: automation.actions.map((action) => {
      if (action.type !== DELIVER_WEBHOOK_ACTION) {
        return action;
      }
      const { secretRef: _secretRef, ...input } = action.input;
      return { ...action, input };
    }),
  };
}

function webhookTarget(automation: Automation): DeliverWebhookInput {
  return deliverWebhookInputSchema.parse(automation.actions[0]?.input);
}

function toWebhook(automation: Automation): Webhook {
  return {
    orgId: automation.orgId,
    id: automation.id,
    url: webhookTarget(automation).url,
    events: automation.triggers,
    description: automation.description,
    enabled: automation.enabled,
    createdAt: automation.createdAt,
    updatedAt: automation.updatedAt,
  };
}

function updateEvent(orgId: string, input: { enabled?: boolean }, updated: Automation) {
  if (isEnabledOnlyUpdate(input)) {
    return input.enabled
      ? automationEvents.automationEnabled.make({ orgId, data: updated })
      : automationEvents.automationDisabled.make({ orgId, data: updated });
  }
  return automationEvents.automationUpdated.make({ orgId, data: updated });
}

export type AutomationsServiceParams = {
  /** Read-only access (list/get/available) — runs outside any transaction. */
  repo: AutomationsRepository;
  runsRepo: AutomationRunsRepository;
  /** Atomic write scope: tx-bound repos + credential store + outbox appender. */
  uow: AutomationsUnitOfWork;
  engine: AutomationEngine;
  mailer: Pick<Mailer, 'send'>;
  lookups: MailerLookups;
  integrations: Pick<IntegrationsService, 'available'>;
  credentials: CredentialStore;
  webhooks: WebhookSender;
  mail: Omit<CommunityMailReads, 'recentMessageRecipients'>;
  grants: GrantWriter;
  desk: NotificationDesk;
  scheduledWork: ScheduledWork;
  logger?: Logger;
};

export class AutomationsServiceImpl implements AutomationsService, AutomationExecutor {
  private readonly repo: AutomationsRepository;
  private readonly runsRepo: AutomationRunsRepository;
  private readonly uow: AutomationsUnitOfWork;
  private readonly engine: AutomationEngine;
  private readonly mailer: Pick<Mailer, 'send'>;
  private readonly lookups: MailerLookups;
  private readonly integrations: Pick<IntegrationsService, 'available'>;
  private readonly credentials: CredentialStore;
  private readonly webhooks: WebhookSender;
  private readonly mail: CommunityMailReads;
  private readonly grants: GrantWriter;
  private readonly desk: NotificationDesk;
  private readonly scheduledWork: ScheduledWork;
  private readonly logger: Logger;

  constructor(params: AutomationsServiceParams) {
    this.repo = params.repo;
    this.runsRepo = params.runsRepo;
    this.uow = params.uow;
    this.engine = params.engine;
    this.mailer = params.mailer;
    this.lookups = params.lookups;
    this.integrations = params.integrations;
    this.credentials = params.credentials;
    this.webhooks = params.webhooks;
    this.mail = {
      ...params.mail,
      recentMessageRecipients: (orgId, automationId, chatId, since) =>
        this.runsRepo.recentRecipients(orgId, automationId, chatId, since),
    };
    this.grants = params.grants;
    this.desk = params.desk;
    this.scheduledWork = params.scheduledWork;
    this.logger = params.logger ?? noopLogger;
  }

  async handle(event: DomainEvent): Promise<void> {
    // automation.* events are this service's own output — matching one as a trigger would self-loop.
    if (event.type.startsWith('automation.')) {
      return;
    }
    await this.seedFor(event);
    const automations = await this.safeListByTrigger(event);
    for (const automation of automations) {
      const matches = filterMatches(automation.filter, event.data);
      if (!automation.enabled || !matches) {
        if (automation.enabled && !matches) {
          this.logger.debug('automation filter skipped', {
            orgId: event.orgId,
            automationId: automation.id,
            trigger: event.type,
          });
        }
        continue;
      }
      await this.dispatchOne(automation, event);
    }
  }

  private seedsFor(event: DomainEvent): SeedAutomation[] | null {
    if (event.type === 'organization.created') {
      return orgSeeds();
    }
    if (event.type !== 'content.community.created') {
      return null;
    }
    const communityId = recordString(event.data, 'id');
    if (!communityId) {
      this.logger.error('community seed missing id', { orgId: event.orgId, eventId: event.id });
      return null;
    }
    return communitySeeds(communityId);
  }

  private async seedFor(event: DomainEvent): Promise<void> {
    const rows = this.seedsFor(event);
    if (!rows) {
      return;
    }
    const seeded = await this.uow.run(async ({ automations, outbox }) => {
      const created = [];
      for (const row of rows) {
        const inserted = await automations.insertSeed(event.orgId, {
          name: row.name,
          description: row.description,
          triggers: row.triggers,
          actions: row.actions,
          filter: row.filter,
          kind: 'workflow',
          source: 'system',
        });
        if (inserted) {
          created.push(
            automationEvents.automationCreated.make({ orgId: event.orgId, data: inserted }),
          );
        }
      }
      if (created.length > 0) {
        await outbox.append(created);
        this.logger.info('system automations seeded', {
          orgId: event.orgId,
          trigger: event.type,
          count: created.length,
        });
      }
      return created.length;
    });
    if (seeded > 0) {
      await this.reconcileSchedules(event.orgId);
    }
  }

  private async reconcileSchedules(orgId: string): Promise<void> {
    try {
      await this.engine.syncSchedules?.();
    } catch (err) {
      this.logger.error('automation schedules not reconciled', { orgId, err });
    }
  }

  private async safeListByTrigger(event: DomainEvent): Promise<Automation[]> {
    try {
      return await this.repo.listByTrigger(event.orgId, event.type);
    } catch (err) {
      this.logger.error('automations: failed to load trigger matches', {
        orgId: event.orgId,
        trigger: event.type,
        err,
      });
      return [];
    }
  }

  private async dispatchOne(automation: Automation, event: DomainEvent): Promise<void> {
    let run: AutomationRun | null = null;
    try {
      run = await this.openRun(automation, event);
      if (!run) {
        // At-least-once redelivery of a trigger event already run for this automation — no-op.
        return;
      }
      await this.engine.dispatch(this.dispatchFor(automation, run, event));
    } catch (err) {
      this.logger.error('automation run failed', {
        orgId: event.orgId,
        automationId: automation.id,
        runId: run?.id,
        trigger: event.type,
        eventId: event.id,
        err,
      });
      if (run) {
        await this.recordFailure(run, err instanceof Error ? err.message : String(err));
      }
    }
  }

  private openRun(automation: Automation, event: DomainEvent): Promise<AutomationRun | null> {
    const now = new Date();
    return this.uow.run(async ({ runs, outbox }) => {
      const inserted = await runs.insert(event.orgId, {
        orgId: event.orgId,
        automationId: automation.id,
        trigger: event.type,
        event,
        status: 'running',
        actionResults: [],
        startedAt: now,
        finishedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      if (!inserted) {
        return null;
      }
      await outbox.append([
        automationEvents.runStarted.make({
          orgId: event.orgId,
          data: inserted,
        }),
      ]);
      return inserted;
    });
  }

  private dispatchFor(
    automation: Automation,
    run: AutomationRun,
    event: DomainEvent,
  ): AutomationDispatch {
    return {
      runId: run.id,
      orgId: event.orgId,
      automationId: automation.id,
      actions: automation.actions,
      event,
    };
  }

  /** Best-effort: logs and never rethrows — `handle` must never throw. */
  private async recordFailure(run: AutomationRun, error: string): Promise<AutomationRun | null> {
    try {
      return await this.uow.run(async ({ runs, outbox }) => {
        const failed = await runs.recordOutcome(run.orgId, run.id, {
          status: 'failed',
          actionResults: run.actionResults,
          finishedAt: new Date(),
        });
        if (failed) {
          await outbox.append([
            automationEvents.runFailed.make({
              orgId: run.orgId,
              data: failed,
            }),
          ]);
        }
        return failed;
      });
    } catch (err) {
      this.logger.error('failed to record automation run failure', {
        orgId: run.orgId,
        automationId: run.automationId,
        runId: run.id,
        err,
        originalError: error,
      });
      return null;
    }
  }

  async runAction(d: AutomationDispatch, index: number): Promise<AutomationActionResult> {
    const action = d.actions[index];
    if (!action) {
      throw new Error(`automation ${d.automationId} run ${d.runId}: no action at index ${index}`);
    }
    let outcome: ActionOutcome;
    try {
      outcome = await executeAction(action, d.event, {
        mailer: this.mailer,
        lookups: this.lookups,
        credentials: this.credentials,
        webhooks: this.webhooks,
        mail: this.mail,
        grants: this.grants,
        desk: this.desk,
        scheduledWork: this.scheduledWork,
        automationId: d.automationId,
        actionInput: action.input,
        logger: this.logger,
      });
    } catch (err) {
      this.logger.error('automation action failed', {
        orgId: d.orgId,
        automationId: d.automationId,
        runId: d.runId,
        trigger: d.event.type,
        index,
        type: action.type,
        err,
      });
      throw err instanceof ActionFailedError ? err : new ActionFailedError();
    }
    const { recipients, failed } = outcome;
    this.logger.info('automation action completed', {
      orgId: d.orgId,
      automationId: d.automationId,
      runId: d.runId,
      type: action.type,
      recipients: recipients.length,
      failed: failed.length,
    });
    return {
      index,
      type: action.type,
      status: 'completed',
      ...(recipients.length > 0 ? { recipients } : {}),
      ...(failed.length > 0
        ? { error: `delivery failed for ${failed.length} recipients: ${failed.join(', ')}` }
        : {}),
    };
  }

  async listSchedules(): Promise<ScheduledAutomation[]> {
    return this.repo.listSchedules();
  }

  async fireSchedule(orgId: string, automationId: string, at: Date): Promise<void> {
    const firedAt = new Date(floorMinute(at));
    const automation = await this.repo.findById(orgId, automationId);
    if (!automation?.enabled || firedAt.getTime() < floorMinute(automation.createdAt)) {
      this.logger.debug('schedule skipped', { orgId, automationId });
      return;
    }
    if (!(await this.scheduleHasWork(orgId, automation, firedAt))) {
      this.logger.debug('schedule idle', { orgId, automationId });
      return;
    }
    const event: DomainEvent = {
      type: SCHEDULE_FIRED,
      id: `schedule_${automationId}_${firedAt.toISOString()}`,
      orgId,
      version: 1,
      occurredAt: firedAt.toISOString(),
      data: { automationId, firedAt: firedAt.toISOString() },
    };
    await this.dispatchOne(automation, event);
  }

  private async scheduleHasWork(
    orgId: string,
    automation: Automation,
    firedAt: Date,
  ): Promise<boolean> {
    const checks = automation.actions.map((action) => this.pendingWork(action.type));
    const known = checks.filter((check) => check !== null);
    if (checks.length === 0 || known.length < checks.length) {
      return true;
    }
    for (const check of known) {
      if (await check(orgId, firedAt)) {
        return true;
      }
    }
    return false;
  }

  private pendingWork(type: string): ((orgId: string, now: Date) => Promise<boolean>) | null {
    switch (type) {
      case 'publishDuePosts':
        return (orgId, now) => this.scheduledWork.hasDuePosts(orgId, now);
      case 'expireDueGrants':
        return (orgId, now) => this.scheduledWork.hasDueGrants(orgId, now);
      case 'removeUnattachedUploads':
        return (orgId, now) => this.scheduledWork.hasUnattachedUploads(orgId, now);
      default:
        return null;
    }
  }

  async finalize(d: AutomationDispatch, results: AutomationActionResult[]): Promise<void> {
    const status: 'completed' | 'failed' =
      results.length === d.actions.length && results.every((r) => r.status === 'completed')
        ? 'completed'
        : 'failed';
    await this.uow.run(async ({ runs, outbox }) => {
      const run = await runs.recordOutcome(d.orgId, d.runId, {
        status,
        actionResults: results,
        finishedAt: new Date(),
      });
      if (!run) {
        return;
      }
      const runEvent =
        status === 'completed'
          ? automationEvents.runCompleted.make({ orgId: d.orgId, data: run })
          : automationEvents.runFailed.make({ orgId: d.orgId, data: run });
      const actionFailedEvents = results
        .filter((r) => r.status === 'failed')
        .map((result) => ({
          ...automationEvents.actionFailed.make({
            orgId: d.orgId,
            data: result,
          }),
        }));
      await outbox.append([runEvent, ...actionFailedEvents]);
    });
    this.logOutcome(d, status, results);
  }

  private logOutcome(
    d: AutomationDispatch,
    status: 'completed' | 'failed',
    results: AutomationActionResult[],
  ): void {
    const run = {
      orgId: d.orgId,
      automationId: d.automationId,
      runId: d.runId,
      trigger: d.event.type,
      eventId: d.event.id,
    };
    if (status === 'failed') {
      const failed = results.find((r) => r.status === 'failed');
      const index = failed?.index ?? results.length;
      this.logger.error('automation run failed', {
        ...run,
        index,
        action: failed?.type ?? d.actions[index]?.type,
        error: failed?.error ?? 'not every action ran',
      });
      return;
    }
    const partial = results.filter((r) => r.error !== undefined);
    if (partial.length > 0) {
      this.logger.warn('automation run completed with failed deliveries', {
        ...run,
        actions: partial.map(({ index, type, error }) => ({ index, type, error })),
      });
    }
  }

  async create(orgId: string, input: CreateAutomationInput): Promise<Automation> {
    assertCatalogTriggers(input.triggers, true);
    assertAuthorableActions(input.actions);
    const automation = await this.uow.run(async ({ automations, outbox }) => {
      const created = await automations.insert(orgId, {
        ...input,
        triggers: unique(input.triggers),
        kind: 'workflow',
      });
      await outbox.append([automationEvents.automationCreated.make({ orgId, data: created })]);
      return created;
    });
    this.logger.info('automation created', { orgId, automationId: automation.id });
    await this.reconcileSchedules(orgId);
    return automation;
  }

  async update(
    orgId: string,
    id: string,
    input: UpdateAutomationInput,
  ): Promise<Automation | null> {
    if (input.triggers !== undefined) {
      assertCatalogTriggers(input.triggers, true);
    }
    if (input.actions !== undefined) {
      assertAuthorableActions(input.actions);
    }
    const existing = await this.repo.findById(orgId, id);
    if (!existing) {
      return null;
    }
    if (existing.kind !== 'workflow') {
      throw new AutomationKindMismatchError(id, existing.kind);
    }
    const patch =
      input.triggers === undefined ? input : { ...input, triggers: unique(input.triggers) };
    const automation = await this.uow.run(async ({ automations, outbox }) => {
      const updated = await automations.update(orgId, id, patch);
      if (!updated) {
        return null;
      }
      await outbox.append([updateEvent(orgId, input, updated)]);
      return updated;
    });
    if (automation) {
      this.logger.info('automation updated', { orgId, automationId: id });
      await this.reconcileSchedules(orgId);
    }
    return automation;
  }

  async delete(orgId: string, id: string): Promise<boolean> {
    const existing = await this.repo.findById(orgId, id);
    if (!existing) {
      return false;
    }
    if (existing.kind !== 'workflow') {
      throw new AutomationKindMismatchError(id, existing.kind);
    }
    if (existing.source === 'system') {
      throw new ConflictError('A system automation cannot be deleted');
    }
    const deleted = await this.uow.run(async ({ automations, outbox }) => {
      const removed = await automations.delete(orgId, id);
      if (!removed) {
        return null;
      }
      await outbox.append([automationEvents.automationDeleted.make({ orgId, data: removed })]);
      return removed;
    });
    if (deleted) {
      this.logger.info('automation deleted', { orgId, automationId: id });
      await this.reconcileSchedules(orgId);
    }
    return deleted !== null;
  }

  async list(orgId: string, query?: AutomationsQuery): Promise<Automation[]> {
    const automations = await this.repo.listByOrg(orgId, query?.kind);
    return automations.map(toAutomationView);
  }

  async get(orgId: string, id: string): Promise<Automation | null> {
    const automation = await this.repo.findById(orgId, id);
    return automation ? toAutomationView(automation) : null;
  }

  async listRuns(
    orgId: string,
    automationId: string,
    query: AutomationRunsQuery,
  ): Promise<Page<AutomationRun>> {
    const page = await this.runsRepo.list(orgId, automationId, query);
    return { ...page, rows: page.rows.map(toRunView) };
  }

  async rerun(orgId: string, automationId: string, runId: string): Promise<AutomationRun> {
    const existing = await this.runsRepo.findById(orgId, runId);
    if (!existing || existing.automationId !== automationId) {
      throw new NotFoundError('Automation run', runId);
    }
    const automation = await this.repo.findById(orgId, automationId);
    if (!automation) {
      throw new NotFoundError('Automation', automationId);
    }
    const run = await this.uow.run(async ({ runs, outbox }) => {
      const restarted = await runs.restart(orgId, runId, new Date());
      if (!restarted) {
        return null;
      }
      await outbox.append([automationEvents.runStarted.make({ orgId, data: restarted })]);
      return restarted;
    });
    if (!run) {
      throw new ConflictError(`automation run ${runId} is still running`);
    }
    try {
      await this.engine.dispatch(this.dispatchFor(automation, run, run.event));
    } catch (err) {
      this.logger.error('automation rerun failed', {
        orgId,
        automationId,
        runId: run.id,
        trigger: run.trigger,
        err,
      });
      const failed = await this.recordFailure(
        run,
        err instanceof Error ? err.message : String(err),
      );
      return toRunView(failed ?? run);
    }
    this.logger.info('automation rerun started', { orgId, automationId, runId: run.id });
    return toRunView(run);
  }

  async listWebhooks(orgId: string): Promise<Webhook[]> {
    const automations = await this.repo.listByOrg(orgId, 'webhook');
    return automations.map(toWebhook);
  }

  async getWebhook(orgId: string, id: string): Promise<Webhook | null> {
    const automation = await this.findWebhook(orgId, id);
    return automation ? toWebhook(automation) : null;
  }

  async createWebhook(orgId: string, input: CreateWebhookInput): Promise<CreatedWebhook> {
    const events = unique(input.events);
    assertCatalogTriggers(events, false);
    const secret = generateWebhookSecret();
    const automation = await this.uow.run(async ({ automations, credentials, outbox }) => {
      const secretRef = await credentials.store(orgId, { secret });
      const created = await automations.insert(orgId, {
        kind: 'webhook',
        name: input.url,
        description: input.description,
        triggers: events,
        actions: [{ type: DELIVER_WEBHOOK_ACTION, input: { url: input.url, secretRef } }],
      });
      await outbox.append([automationEvents.automationCreated.make({ orgId, data: created })]);
      return created;
    });
    this.logger.info('webhook created', { orgId, automationId: automation.id });
    return { ...toWebhook(automation), secret };
  }

  async updateWebhook(
    orgId: string,
    id: string,
    input: UpdateWebhookInput,
  ): Promise<Webhook | null> {
    const existing = await this.findWebhook(orgId, id);
    if (!existing) {
      return null;
    }
    const events = input.events === undefined ? undefined : unique(input.events);
    if (events) {
      assertCatalogTriggers(events, false);
    }
    const { secretRef } = webhookTarget(existing);
    const patch: UpdateAutomationInput = {
      name: input.url,
      description: input.description,
      triggers: events,
      actions:
        input.url === undefined
          ? undefined
          : [{ type: DELIVER_WEBHOOK_ACTION, input: { url: input.url, secretRef } }],
      enabled: input.enabled,
    };
    const updated = await this.uow.run(async ({ automations, outbox }) => {
      const row = await automations.update(orgId, id, patch);
      if (!row) {
        return null;
      }
      await outbox.append([updateEvent(orgId, input, row)]);
      return row;
    });
    if (!updated) {
      return null;
    }
    this.logger.info('webhook updated', { orgId, automationId: id });
    return toWebhook(updated);
  }

  async deleteWebhook(orgId: string, id: string): Promise<boolean> {
    const existing = await this.findWebhook(orgId, id);
    if (!existing) {
      return false;
    }
    const { secretRef } = webhookTarget(existing);
    const deleted = await this.uow.run(async ({ automations, credentials, outbox }) => {
      const removed = await automations.delete(orgId, id);
      if (!removed) {
        return null;
      }
      await credentials.destroy(orgId, secretRef);
      await outbox.append([automationEvents.automationDeleted.make({ orgId, data: removed })]);
      return removed;
    });
    if (deleted) {
      this.logger.info('webhook deleted', { orgId, automationId: id });
    }
    return deleted !== null;
  }

  async revealWebhookSecret(orgId: string, id: string): Promise<WebhookSecret | null> {
    const existing = await this.findWebhook(orgId, id);
    if (!existing) {
      return null;
    }
    const secrets = await this.credentials.reveal(orgId, webhookTarget(existing).secretRef);
    const secret = secrets?.['secret'];
    if (typeof secret !== 'string') {
      throw new Error(`webhook ${id}: signing secret is missing`);
    }
    return { secret };
  }

  async rotateWebhookSecret(orgId: string, id: string): Promise<WebhookSecret | null> {
    const existing = await this.findWebhook(orgId, id);
    if (!existing) {
      return null;
    }
    const secret = generateWebhookSecret();
    await this.credentials.update(orgId, webhookTarget(existing).secretRef, { secret });
    this.logger.info('webhook secret rotated', { orgId, automationId: id });
    return { secret };
  }

  private async findWebhook(orgId: string, id: string): Promise<Automation | null> {
    const automation = await this.repo.findById(orgId, id);
    return automation?.kind === 'webhook' ? automation : null;
  }

  availableActions(): AvailableActions {
    return [
      ...catalogActions(),
      ...this.integrations.available().flatMap((integration) =>
        integration.actions.map((action) => ({
          type: `${integration.id}.${action.id}`,
          description: action.description,
          inputSchema: action.inputSchema as Record<string, JsonValue>,
          source: integration.id,
        })),
      ),
    ];
  }

  availableTriggers(): AvailableTriggers {
    return { triggers: catalogTriggers() };
  }
}
