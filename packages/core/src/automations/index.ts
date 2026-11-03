// automations context — public surface. Re-export only what other contexts may use.
export { AutomationsServiceImpl } from './service.js';
export { cronMatches } from './schedule.js';
export { NOTIFICATION_TYPES } from './notifications/types.js';
export { DEFAULT_COMMUNITY_CATEGORIES, DEFAULT_ORG_CATEGORIES } from './notifications/defaults.js';
export type { CommunityMailReads, GrantWriter } from './community-mail.js';
export { automationEvents } from './events.js';
export {
  ACTION_FAILED,
  ActionFailedError,
  actionFailureMessage,
  AutomationKindMismatchError,
  InvalidTriggerError,
  ReservedActionError,
} from './model.js';
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
  NotificationCategories,
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
