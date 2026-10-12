// identity context — public surface.
export { IdentityServiceImpl } from './service.js';
export { identityEvents } from './events.js';
export type {
  IdentityService,
  IdentityRepository,
  UserProvisioner,
  UserResolver,
  UserEditor,
  SessionAdmin,
  AuthHeaders,
} from './ports.js';
export type { User } from './model.js';
export type { UserId, CreateUserInput, ProvisionUserInput, UpdateUserInput } from './types.js';
export type { IdentityEvent, UserCreated, UserDeleted, UserUpdated } from './events.js';
export * from './access.js';
