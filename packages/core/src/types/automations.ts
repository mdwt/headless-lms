import type { DomainEvent } from './shared.js';
import type { AutomationAction, AutomationActionResult } from './schemas/automations.js';

export type {
  Automation,
  AutomationAction,
  AutomationActionResult,
  AutomationKind,
  AutomationRun,
  AutomationRunsQuery,
  AutomationRunStatus,
  AutomationsQuery,
  AutomationTrigger,
  AvailableAction,
  AvailableActions,
  AvailableTriggers,
  CreateAutomationInput,
  CreatedWebhook,
  CreateWebhookInput,
  DeliverWebhookInput,
  UpdateAutomationInput,
  UpdateWebhookInput,
  Webhook,
  WebhookSecret,
} from './schemas/automations.js';

export interface AutomationDispatch {
  runId: string;
  orgId: string;
  automationId: string;
  actions: AutomationAction[];
  event: DomainEvent;
}

export interface AutomationExecutor {
  runAction(d: AutomationDispatch, index: number): Promise<AutomationActionResult>;
  finalize(d: AutomationDispatch, results: AutomationActionResult[]): Promise<void>;
}

export interface AutomationEngine {
  register(executor: AutomationExecutor): void;
  dispatch(d: AutomationDispatch): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
}

export interface WebhookRequest {
  url: string;
  headers: Record<string, string>;
  body: string;
}

export interface WebhookResponse {
  status: number;
}

export interface WebhookSender {
  send(request: WebhookRequest): Promise<WebhookResponse>;
}
