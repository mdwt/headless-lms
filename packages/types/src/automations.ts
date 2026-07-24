// automations context — domain entities, DTOs, and events.
import type { DomainEvent } from "./shared.js";
import type { EmailTemplateId } from "./email-templates.js";

/** Any DomainEvent type. */
export type AutomationTrigger = string;

export type AutomationAction = { type: "sendEmail"; template: EmailTemplateId };

export interface Automation {
  readonly id: string;
  name: string;
  description?: string;
  trigger: AutomationTrigger;
  actions: AutomationAction[]; // ordered
  enabled: boolean;
}

export interface CreateAutomationInput {
  name: string;
  description?: string;
  trigger: AutomationTrigger;
  actions: AutomationAction[];
}
export type UpdateAutomationInput = Partial<CreateAutomationInput> & {
  enabled?: boolean;
};

export interface AutomationRunsQuery {
  page: number;
  pageSize: number;
  status?: AutomationRunStatus | undefined;
  sort?: string | undefined;
}

/** Which actions an automation can use: built-in types plus every loaded integration's own. */
export interface AvailableActions {
  actions: {
    type: AutomationAction["type"];
    description: string;
    config: Record<string, unknown>;
    validTemplatesByTrigger: Record<string, EmailTemplateId[]>;
  }[];
  integrations: {
    id: string;
    actions: {
      id: string;
      description: string;
      inputSchema: Record<string, unknown>;
      outputSchema: Record<string, unknown>;
    }[];
  }[];
}

/** Which domain events an automation can react to. */
export interface AvailableTriggers {
  triggers: { type: string; description: string }[];
}

export type AutomationRunStatus = "running" | "completed" | "failed";

export interface AutomationActionResult {
  index: number;
  type: AutomationAction["type"];
  status: "completed" | "failed";
  error?: string;
}

export interface AutomationRun {
  readonly id: string;
  orgId: string;
  automationId: string;
  trigger: AutomationTrigger;
  event: DomainEvent; // triggering event snapshot (jsonb)
  status: AutomationRunStatus;
  actionResults: AutomationActionResult[];
  startedAt: string;
  finishedAt: string | null;
}

// --- engine contract (deployment port) -----
/** Serializable — action functions never cross this boundary. */
export interface AutomationDispatch {
  runId: string;
  orgId: string;
  automationId: string;
  actions: AutomationAction[];
  event: DomainEvent;
}

/** Domain-owned; the engine orders steps, retries failures, and calls finalize exactly once at the end. */
export interface AutomationExecutor {
  runAction(d: AutomationDispatch, index: number): Promise<AutomationActionResult>;
  finalize(d: AutomationDispatch, results: AutomationActionResult[]): Promise<void>;
}

export interface AutomationEngine {
  /** Container wires the domain executor before start. */
  register(executor: AutomationExecutor): void;
  /** Hand a run off. Inline: runs now. Hatchet: workflow run, no-wait. */
  dispatch(d: AutomationDispatch): Promise<void>;
  /** Worker lifecycle — started by the installation entry point after listen, stopped by buildServer onClose. */
  start(): Promise<void>;
  stop(): Promise<void>;
}

// --- events — the catalog from docs/domain/automations.md -----
export interface AutomationCreated extends DomainEvent {
  type: "automation.created";
  automation: Automation;
}
export interface AutomationUpdated extends DomainEvent {
  type: "automation.updated";
  automation: Automation;
}
export interface AutomationDeleted extends DomainEvent {
  type: "automation.deleted";
  automation: Automation;
}
export interface AutomationEnabled extends DomainEvent {
  type: "automation.enabled";
  automationId: string;
}
export interface AutomationDisabled extends DomainEvent {
  type: "automation.disabled";
  automationId: string;
}
export interface AutomationRunStarted extends DomainEvent {
  type: "automation.run.started";
  run: AutomationRun;
}
export interface AutomationRunCompleted extends DomainEvent {
  type: "automation.run.completed";
  run: AutomationRun;
}
export interface AutomationRunFailed extends DomainEvent {
  type: "automation.run.failed";
  run: AutomationRun;
}
export interface AutomationActionFailed extends DomainEvent {
  type: "automation.action.failed";
  runId: string;
  automationId: string;
  result: AutomationActionResult;
}
export type AutomationEvent =
  | AutomationCreated
  | AutomationUpdated
  | AutomationDeleted
  | AutomationEnabled
  | AutomationDisabled
  | AutomationRunStarted
  | AutomationRunCompleted
  | AutomationRunFailed
  | AutomationActionFailed;
