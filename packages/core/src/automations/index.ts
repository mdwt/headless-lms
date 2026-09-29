// automations context — public surface. Re-export only what other contexts may use.
export { AutomationsServiceImpl } from './service.js';
export { automationEvents } from './events.js';
export { AutomationKindMismatchError, InvalidTriggerError, ReservedActionError } from './model.js';
export type {
  AutomationsService,
  AutomationsRepository,
  AutomationRunsRepository,
  AutomationsUnitOfWork,
  AutomationDispatch,
  AutomationExecutor,
  AutomationEngine,
  NewAutomation,
  NewAutomationRun,
  WebhookRequest,
  WebhookResponse,
  WebhookSender,
} from './ports.js';
export type {
  Automation,
  AutomationTrigger,
  AutomationAction,
  AutomationKind,
  AutomationRunStatus,
  AutomationActionResult,
  AutomationRun,
  Webhook,
  CreatedWebhook,
  WebhookSecret,
  Page,
} from './model.js';
export type {
  CreateAutomationInput,
  UpdateAutomationInput,
  AutomationsQuery,
  AutomationRunsQuery,
  AvailableAction,
  AvailableActions,
  AvailableTriggers,
  CreateWebhookInput,
  UpdateWebhookInput,
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
