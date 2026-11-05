// identity context — public surface.
export { IdentityServiceImpl } from './service.js';
export { NotificationSettingsServiceImpl } from './notification-settings.js';
export { DevicesServiceImpl } from './devices.js';
export { identityEvents } from './events.js';
export {
  devicesDeclarations,
  identityDeclarations,
  notificationSettingsDeclarations,
} from './declarations.js';
export type {
  IdentityService,
  IdentityRepository,
  UserProvisioner,
  UserResolver,
  UserEditor,
  SessionAdmin,
  AuthHeaders,
  MemberActor,
  SettingChange,
  SettingKey,
  NotificationSettingsService,
  NotificationSettingsRepository,
  NotificationCategoryReader,
  CommunityAccessReader,
  DeviceRegistration,
  DevicesService,
  DevicesRepository,
  NewDevice,
} from './ports.js';
export type { User, UserProfile, UserProfileView } from './model.js';
export type { ProfilePatch, UpdateProfileInput } from './ports.js';
export type { UserId, CreateUserInput, ProvisionUserInput, UpdateUserInput } from './types.js';
export type { IdentityEvent, UserCreated, UserDeleted, UserUpdated } from './events.js';
export * from './access.js';
