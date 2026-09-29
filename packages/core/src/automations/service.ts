// automations context — service implementation (inbound port) and the
// AutomationExecutor the engine drives.
//
// `handle` is subscribed to all events on the EventBus: it matches an event
// against enabled automations for its trigger, opens one run per match, and
// hands it to the injected AutomationEngine, which calls back into
// `runAction`/`finalize`.
import { catalogActions, catalogTriggers, DELIVER_WEBHOOK_ACTION } from './catalog.js';
import { executeAction } from './actions.js';
import { generateWebhookSecret } from './webhook-signing.js';
import {
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
import type { JsonValue } from '../types/index.js';
import { deliverWebhookInputSchema } from '../types/schemas/index.js';
import { NotFoundError } from '../shared/errors.js';
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

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function assertAuthorableTriggers(triggers: string[]): void {
  for (const trigger of triggers) {
    if (trigger.startsWith('automation.')) {
      throw new InvalidTriggerError(trigger);
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
    this.logger = params.logger ?? noopLogger;
  }

  async handle(event: DomainEvent): Promise<void> {
    // automation.* events are this service's own output — matching one as a trigger would self-loop.
    if (event.type.startsWith('automation.')) {
      return;
    }
    const automations = await this.safeListByTrigger(event);
    for (const automation of automations.filter((a) => a.enabled)) {
      await this.dispatchOne(automation, event);
    }
  }

  private async safeListByTrigger(event: DomainEvent): Promise<Automation[]> {
    try {
      return await this.repo.listByTrigger(event.orgId, event.type);
    } catch (err) {
      this.logger.error('automations: failed to load trigger matches', {
        orgId: event.orgId,
        trigger: event.type,
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
  }

  private async dispatchOne(automation: Automation, event: DomainEvent): Promise<void> {
    let run: AutomationRun | null = null;
    try {
      run = await this.openRun(automation, event, null);
      if (!run) {
        // At-least-once redelivery of a trigger event already run for this automation — no-op.
        return;
      }
      await this.engine.dispatch(this.dispatchFor(automation, run, event));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error('automation run failed', {
        orgId: event.orgId,
        automationId: automation.id,
        runId: run?.id,
        error: message,
      });
      if (run) {
        await this.recordFailure(run, message);
      }
    }
  }

  private openRun(
    automation: Automation,
    event: DomainEvent,
    rerunOf: string | null,
  ): Promise<AutomationRun | null> {
    const now = new Date();
    return this.uow.run(async ({ runs, outbox }) => {
      const inserted = await runs.insert(event.orgId, {
        orgId: event.orgId,
        automationId: automation.id,
        trigger: event.type,
        event,
        rerunOf,
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
        runId: run.id,
        error: err instanceof Error ? err.message : String(err),
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
    await executeAction(action, d.event, {
      mailer: this.mailer,
      lookups: this.lookups,
      credentials: this.credentials,
      webhooks: this.webhooks,
    });
    return { index, type: action.type, status: 'completed' };
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
  }

  async create(orgId: string, input: CreateAutomationInput): Promise<Automation> {
    assertAuthorableTriggers(input.triggers);
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
    return automation;
  }

  async update(
    orgId: string,
    id: string,
    input: UpdateAutomationInput,
  ): Promise<Automation | null> {
    if (input.triggers !== undefined) {
      assertAuthorableTriggers(input.triggers);
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
    }
    return deleted !== null;
  }

  list(orgId: string, query?: AutomationsQuery): Promise<Automation[]> {
    return this.repo.listByOrg(orgId, query?.kind);
  }

  get(orgId: string, id: string): Promise<Automation | null> {
    return this.repo.findById(orgId, id);
  }

  listRuns(
    orgId: string,
    automationId: string,
    query: AutomationRunsQuery,
  ): Promise<Page<AutomationRun>> {
    return this.runsRepo.list(orgId, automationId, query);
  }

  async rerun(orgId: string, automationId: string, runId: string): Promise<AutomationRun> {
    const previous = await this.runsRepo.findById(orgId, runId);
    if (!previous || previous.automationId !== automationId) {
      throw new NotFoundError('Automation run', runId);
    }
    const automation = await this.repo.findById(orgId, automationId);
    if (!automation) {
      throw new NotFoundError('Automation', automationId);
    }
    const run = await this.openRun(automation, previous.event, previous.id);
    if (!run) {
      throw new Error(`automation ${automationId}: rerun of run ${runId} was not recorded`);
    }
    try {
      await this.engine.dispatch(this.dispatchFor(automation, run, previous.event));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error('automation rerun failed', {
        orgId,
        automationId,
        runId: run.id,
        error: message,
      });
      return (await this.recordFailure(run, message)) ?? run;
    }
    this.logger.info('automation rerun started', { orgId, automationId, runId: run.id });
    return run;
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
    this.assertSubscribableEvents(events);
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
      this.assertSubscribableEvents(events);
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

  private assertSubscribableEvents(events: string[]): void {
    assertAuthorableTriggers(events);
    const known = new Set(catalogTriggers().map((t) => t.type));
    for (const event of events) {
      if (!known.has(event)) {
        throw new InvalidTriggerError(event, 'unknown');
      }
    }
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
