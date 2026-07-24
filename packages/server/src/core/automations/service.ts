// automations context — service implementation (inbound port) and the
// AutomationExecutor the engine drives.
//
// `handle` is subscribed to all events on the EventBus: it matches an event
// against enabled automations for its trigger, opens one run per match, and
// hands it to the injected AutomationEngine, which calls back into
// `runAction`/`finalize`.
import { catalogActions } from './catalog.js';
import { executeAction } from './actions.js';
import { InvalidTriggerError } from './model.js';
import type { Automation, AutomationActionResult, AutomationRun, Page } from './model.js';
import type {
  AutomationsAvailable,
  AutomationRunsQuery,
  CreateAutomationInput,
  UpdateAutomationInput,
} from './types.js';
import type {
  AutomationDispatch,
  AutomationEngine,
  AutomationExecutor,
  AutomationRunsRepository,
  AutomationsRepository,
  AutomationsService,
  AutomationsUnitOfWork,
} from './ports.js';
import type { DomainEvent, Logger } from '../shared/ports.js';
import { noopLogger } from '../shared/logger.js';
import type { Mailer } from '../shared/mailer.js';
import type { IntegrationsService } from '../integrations/index.js';

/** True only when `input` sets `enabled` and nothing else — emits automation.enabled|disabled instead of automation.updated. */
function isEnabledOnlyUpdate(input: UpdateAutomationInput): input is { enabled: boolean } {
  if (input.enabled === undefined) {
    return false;
  }
  const { enabled: _enabled, ...rest } = input;
  return Object.values(rest).every((v) => v === undefined);
}

export class AutomationsServiceImpl implements AutomationsService, AutomationExecutor {
  constructor(
    /** Read-only access (list/get/available) — runs outside any transaction. */
    private readonly repo: AutomationsRepository,
    private readonly runsRepo: AutomationRunsRepository,
    /** Atomic write scope: tx-bound repos + outbox appender. */
    private readonly uow: AutomationsUnitOfWork,
    private readonly engine: AutomationEngine,
    private readonly mailer: Pick<Mailer, 'send'>,
    private readonly integrations: Pick<IntegrationsService, 'available'>,
    private readonly now: () => string,
    private readonly logger: Logger = noopLogger,
  ) {}

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
    let run: AutomationRun | null | undefined;
    try {
      run = await this.uow.run(async ({ runs, outbox }) => {
        const inserted = await runs.insert(event.orgId, {
          orgId: event.orgId,
          automationId: automation.id,
          trigger: automation.trigger,
          event,
          status: 'running',
          actionResults: [],
          startedAt: this.now(),
          finishedAt: null,
        });
        if (!inserted) {
          // At-least-once redelivery of a trigger event already run for this automation — no-op.
          return null;
        }
        await outbox.append([{ type: 'automation.run.started', orgId: event.orgId, run: inserted }]);
        return inserted;
      });
      if (!run) {
        return;
      }
      await this.engine.dispatch({
        runId: run.id,
        orgId: event.orgId,
        automationId: automation.id,
        actions: automation.actions,
        event,
      });
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

  /** Best-effort: logs and never rethrows — `handle` must never throw. */
  private async recordFailure(run: AutomationRun, error: string): Promise<void> {
    try {
      await this.uow.run(async ({ runs, outbox }) => {
        const failed = await runs.recordOutcome(run.orgId, run.id, {
          status: 'failed',
          actionResults: run.actionResults,
          finishedAt: this.now(),
        });
        if (failed) {
          await outbox.append([{ type: 'automation.run.failed', orgId: run.orgId, run: failed }]);
        }
      });
    } catch (err) {
      this.logger.error('failed to record automation run failure', {
        orgId: run.orgId,
        runId: run.id,
        error: err instanceof Error ? err.message : String(err),
        originalError: error,
      });
    }
  }

  async runAction(d: AutomationDispatch, index: number): Promise<AutomationActionResult> {
    const action = d.actions[index];
    if (!action) {
      throw new Error(`automation ${d.automationId} run ${d.runId}: no action at index ${index}`);
    }
    await executeAction(action, d.event, this.mailer);
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
        finishedAt: this.now(),
      });
      if (!run) {
        return;
      }
      const runEventType =
        status === 'completed' ? ('automation.run.completed' as const) : ('automation.run.failed' as const);
      const runEvent = { type: runEventType, orgId: d.orgId, run };
      const actionFailedEvents = results
        .filter((r) => r.status === 'failed')
        .map((result) => ({
          type: 'automation.action.failed' as const,
          orgId: d.orgId,
          runId: d.runId,
          automationId: d.automationId,
          result,
        }));
      await outbox.append([runEvent, ...actionFailedEvents]);
    });
  }

  async create(orgId: string, input: CreateAutomationInput): Promise<Automation> {
    if (input.trigger.startsWith('automation.')) {
      throw new InvalidTriggerError(input.trigger);
    }
    const automation = await this.uow.run(async ({ automations, outbox }) => {
      const created = await automations.insert(orgId, input);
      await outbox.append([{ type: 'automation.created', orgId, automation: created }]);
      return created;
    });
    this.logger.info('automation created', { orgId, automationId: automation.id });
    return automation;
  }

  async update(orgId: string, id: string, input: UpdateAutomationInput): Promise<Automation | null> {
    if (input.trigger !== undefined && input.trigger.startsWith('automation.')) {
      throw new InvalidTriggerError(input.trigger);
    }
    const automation = await this.uow.run(async ({ automations, outbox }) => {
      const updated = await automations.update(orgId, id, input);
      if (!updated) {
        return null;
      }
      if (isEnabledOnlyUpdate(input)) {
        await outbox.append([
          {
            type: input.enabled ? 'automation.enabled' : 'automation.disabled',
            orgId,
            automationId: id,
          },
        ]);
      } else {
        await outbox.append([{ type: 'automation.updated', orgId, automation: updated }]);
      }
      return updated;
    });
    if (automation) {
      this.logger.info('automation updated', { orgId, automationId: id });
    }
    return automation;
  }

  async delete(orgId: string, id: string): Promise<boolean> {
    const deleted = await this.uow.run(async ({ automations, outbox }) => {
      const removed = await automations.delete(orgId, id);
      if (!removed) {
        return null;
      }
      await outbox.append([{ type: 'automation.deleted', orgId, automation: removed }]);
      return removed;
    });
    if (deleted) {
      this.logger.info('automation deleted', { orgId, automationId: id });
    }
    return deleted !== null;
  }

  list(orgId: string): Promise<Automation[]> {
    return this.repo.listByOrg(orgId);
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

  available(): Promise<AutomationsAvailable> {
    const integrations = this.integrations.available();
    return Promise.resolve({
      actions: catalogActions(),
      integrations: integrations.map((integration) => ({
        id: integration.id,
        actions: integration.actions,
      })),
    });
  }
}
