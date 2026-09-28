import type { DomainEvent } from './shared.js';
import type { AutomationAction, AutomationActionResult } from './schemas/automations.js';

export type {
  Automation,
  AutomationAction,
  AutomationActionResult,
  AutomationRun,
  AutomationRunsQuery,
  AutomationRunStatus,
  AutomationTrigger,
  AvailableAction,
  AvailableActions,
  AvailableTriggers,
  CreateAutomationInput,
  UpdateAutomationInput,
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
