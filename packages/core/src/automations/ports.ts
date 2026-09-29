// automations context — ports. AutomationDispatch/Executor/Engine and the
// WebhookSender contract are owned by @headless-lms/core/types and re-exported
// here so every adapter implementation shares one definition.
import type {
  Automation,
  AutomationKind,
  AutomationRun,
  CreatedWebhook,
  Page,
  Webhook,
  WebhookSecret,
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
import type { CredentialStore, DomainEvent, OutboxAppender, UnitOfWork } from '../shared/ports.js';

export type {
  AutomationDispatch,
  AutomationExecutor,
  AutomationEngine,
  WebhookRequest,
  WebhookResponse,
  WebhookSender,
} from '../types/index.js';

export type NewAutomation = CreateAutomationInput & { kind: AutomationKind };

/** A run row before persistence assigns its id and event_id. */
export type NewAutomationRun = Omit<AutomationRun, 'id' | 'eventId'>;

// Inbound port (use cases the service exposes).
export interface AutomationsService {
  /** Matches `event` against enabled automations and dispatches a run per match; never throws. */
  handle(event: DomainEvent): Promise<void>;
  /** Built-in action types plus every loaded integration's declared actions. */
  availableActions(): AvailableActions;
  /** The domain event types an automation may react to. */
  availableTriggers(): AvailableTriggers;
  list(orgId: string, query?: AutomationsQuery): Promise<Automation[]>;
  get(orgId: string, id: string): Promise<Automation | null>;
  create(orgId: string, input: CreateAutomationInput): Promise<Automation>;
  update(orgId: string, id: string, input: UpdateAutomationInput): Promise<Automation | null>;
  delete(orgId: string, id: string): Promise<boolean>;
  listRuns(
    orgId: string,
    automationId: string,
    query: AutomationRunsQuery,
  ): Promise<Page<AutomationRun>>;
  rerun(orgId: string, automationId: string, runId: string): Promise<AutomationRun>;
  listWebhooks(orgId: string): Promise<Webhook[]>;
  getWebhook(orgId: string, id: string): Promise<Webhook | null>;
  createWebhook(orgId: string, input: CreateWebhookInput): Promise<CreatedWebhook>;
  updateWebhook(orgId: string, id: string, input: UpdateWebhookInput): Promise<Webhook | null>;
  deleteWebhook(orgId: string, id: string): Promise<boolean>;
  revealWebhookSecret(orgId: string, id: string): Promise<WebhookSecret | null>;
  rotateWebhookSecret(orgId: string, id: string): Promise<WebhookSecret | null>;
}

// Outbound ports (persistence contracts the repositories fulfil).
export interface AutomationsRepository {
  insert(orgId: string, input: NewAutomation): Promise<Automation>;
  update(orgId: string, id: string, patch: UpdateAutomationInput): Promise<Automation | null>;
  /** Returns the deleted row (the event snapshot), or null if it didn't exist. */
  delete(orgId: string, id: string): Promise<Automation | null>;
  findById(orgId: string, id: string): Promise<Automation | null>;
  listByOrg(orgId: string, kind?: AutomationKind): Promise<Automation[]>;
  /** All rows whose triggers include `trigger`, enabled and disabled alike — the service filters to `enabled`. */
  listByTrigger(orgId: string, trigger: string): Promise<Automation[]>;
}

export interface AutomationRunsRepository {
  /** Keyed by (orgId, automationId, event.id); returns `null` if this event was already run for this automation (duplicate). */
  insert(orgId: string, run: NewAutomationRun): Promise<AutomationRun | null>;
  findById(orgId: string, id: string): Promise<AutomationRun | null>;
  /** Puts a finished run back to running with no results; `null` if it's missing or still running. */
  restart(orgId: string, id: string, startedAt: Date): Promise<AutomationRun | null>;
  recordOutcome(
    orgId: string,
    id: string,
    outcome: {
      status: AutomationRun['status'];
      actionResults: AutomationRun['actionResults'];
      finishedAt: Date;
    },
  ): Promise<AutomationRun | null>;
  list(
    orgId: string,
    automationId: string,
    query: AutomationRunsQuery,
  ): Promise<Page<AutomationRun>>;
}

/** Tx-scoped port bundle for this context's mutating use cases — every member
 *  is bound to the UnitOfWork's transaction, so the write(s) and the event
 *  append commit or roll back as one. */
export interface AutomationsTxScope {
  automations: AutomationsRepository;
  runs: AutomationRunsRepository;
  credentials: CredentialStore;
  outbox: OutboxAppender;
}

export type AutomationsUnitOfWork = UnitOfWork<AutomationsTxScope>;
