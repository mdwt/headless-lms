// automations context — ports. The engine contract (AutomationDispatch,
// AutomationExecutor, AutomationEngine) is owned by @headless-lms/types so the
// domain and every engine implementation (inline, Hatchet-backed, …) share one
// definition; the context re-exports it as part of its public surface.
import type { Automation, AutomationRun, Page } from './model.js';
import type {
  AutomationsAvailable,
  AutomationRunsQuery,
  CreateAutomationInput,
  UpdateAutomationInput,
} from './types.js';
import type { DomainEvent, OutboxAppender, UnitOfWork } from '../shared/ports.js';

export type { AutomationDispatch, AutomationExecutor, AutomationEngine } from '@headless-lms/types';

/** A run row before persistence assigns its id — mirrors `NewDomainEvent`. */
export type NewAutomationRun = Omit<AutomationRun, 'id'>;

// Inbound port (use cases the service exposes).
export interface AutomationsService {
  /** Match `event` against enabled automations for its trigger and dispatch a
   *  run per match. Never throws — a per-automation failure is logged and
   *  recorded on the run, not propagated to the caller (the outbox relay). */
  handle(event: DomainEvent): Promise<void>;
  /** Which actions an automation can use: built-in action types plus every
   *  loaded integration's declared actions. */
  available(): Promise<AutomationsAvailable>;
  list(orgId: string): Promise<Automation[]>;
  get(orgId: string, id: string): Promise<Automation | null>;
  create(orgId: string, input: CreateAutomationInput): Promise<Automation>;
  update(orgId: string, id: string, input: UpdateAutomationInput): Promise<Automation | null>;
  delete(orgId: string, id: string): Promise<boolean>;
  listRuns(
    orgId: string,
    automationId: string,
    query: AutomationRunsQuery,
  ): Promise<Page<AutomationRun>>;
}

// Outbound ports (persistence contracts the repositories fulfil).
export interface AutomationsRepository {
  insert(orgId: string, input: CreateAutomationInput): Promise<Automation>;
  update(orgId: string, id: string, patch: UpdateAutomationInput): Promise<Automation | null>;
  /** Returns the deleted row (the event snapshot), or null if it didn't exist. */
  delete(orgId: string, id: string): Promise<Automation | null>;
  findById(orgId: string, id: string): Promise<Automation | null>;
  listByOrg(orgId: string): Promise<Automation[]>;
  /** Rows whose `trigger` matches, enabled and disabled alike — the service
   *  filters to `enabled`. */
  listByTrigger(orgId: string, trigger: string): Promise<Automation[]>;
}

export interface AutomationRunsRepository {
  /** Inserts a run keyed by (orgId, automationId, event.id) — the outbox
   *  relay is at-least-once, so a redelivery of the same trigger event for
   *  the same automation hits the unique constraint and this returns `null`
   *  instead of a second row. `null` means: this event was already handled
   *  for this automation — the caller should treat the delivery as a no-op. */
  insert(orgId: string, run: NewAutomationRun): Promise<AutomationRun | null>;
  recordOutcome(
    orgId: string,
    id: string,
    outcome: {
      status: AutomationRun['status'];
      actionResults: AutomationRun['actionResults'];
      finishedAt: string;
    },
  ): Promise<AutomationRun | null>;
  list(orgId: string, automationId: string, query: AutomationRunsQuery): Promise<Page<AutomationRun>>;
}

/** Tx-scoped port bundle for this context's mutating use cases — every member
 *  is bound to the UnitOfWork's transaction, so the write(s) and the event
 *  append commit or roll back as one. */
export interface AutomationsTxScope {
  automations: AutomationsRepository;
  runs: AutomationRunsRepository;
  outbox: OutboxAppender;
}

export type AutomationsUnitOfWork = UnitOfWork<AutomationsTxScope>;
