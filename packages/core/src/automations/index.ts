// automations context — public surface. Re-export only what other contexts may use.
export { AutomationsServiceImpl } from './service.js';
export { cronMatches } from './schedule.js';
export { NotificationsServiceImpl } from './notifications/service.js';
export {
  CHANNEL_NOT_CONFIGURED,
  EVERY_DEVICE_DEAD,
  NO_ADDRESS,
  NotificationDelivery,
} from './notifications/delivery.js';
export {
  DEVICE_WINDOW_MS,
  IN_APP,
  MESSAGE_SENT,
  NotificationProcessor,
  PUSH,
  noChatDebounce,
} from './notifications/processor.js';
export {
  CHAT_QUIET_MS,
  FLUSH_JOB,
  SchedulerChatDebounce,
  flushKey,
  notificationJobs,
} from './notifications/debounce.js';
export { RECIPIENT_RULES } from './notifications/rules/index.js';
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
  DeliveryDispatch,
  NewAutomation,
  NewAutomationRun,
  NewDelivery,
  NewNotification,
  ListedNotification,
  ChatDebounce,
  NotificationCategories,
  NotificationPage,
  NotificationReads,
  RecipientRule,
  NotificationsRepository,
  NotificationsService,
  UnreadCounts,
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
