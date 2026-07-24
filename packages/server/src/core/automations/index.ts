// automations context — public surface. Re-export only what other contexts may use.
export { AutomationsServiceImpl } from './service.js';
export { InvalidTriggerError } from './model.js';
export type {
  AutomationsService,
  AutomationsRepository,
  AutomationRunsRepository,
  AutomationsUnitOfWork,
  AutomationDispatch,
  AutomationExecutor,
  AutomationEngine,
} from './ports.js';
export type {
  Automation,
  AutomationTrigger,
  AutomationAction,
  AutomationRunStatus,
  AutomationActionResult,
  AutomationRun,
  Page,
} from './model.js';
export type {
  CreateAutomationInput,
  UpdateAutomationInput,
  AutomationRunsQuery,
  AutomationsAvailable,
} from './types.js';
export type {
  AutomationCreated,
  AutomationUpdated,
  AutomationDeleted,
  AutomationEnabled,
  AutomationDisabled,
  AutomationRunStarted,
  AutomationRunCompleted,
  AutomationRunFailed,
  AutomationActionFailed,
  AutomationEvent,
} from './events.js';
