// identity context — public surface.
export { IdentityServiceImpl } from './service.js';
export { NotificationServiceImpl, defaultPreference } from './notifications.js';
export { identityEvents } from './events.js';
export type {
  IdentityService,
  IdentityRepository,
  UserProvisioner,
  UserResolver,
  UserEditor,
  SessionAdmin,
  AuthHeaders,
  NewNotification,
  NotificationDesk,
  NotificationInbox,
  NotificationPage,
  NotificationService,
  NotificationsQuery,
  NotificationsRepository,
} from './ports.js';
export type {
  Notification,
  NotificationKind,
  NotificationPreference,
  User,
  UserProfile,
  UserProfileView,
} from './model.js';
export type { ProfilePatch, UpdateProfileInput } from './ports.js';
export type { UserId, CreateUserInput, ProvisionUserInput, UpdateUserInput } from './types.js';
export type { IdentityEvent, UserCreated, UserDeleted, UserUpdated } from './events.js';
