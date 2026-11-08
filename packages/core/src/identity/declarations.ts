import type { Declarations } from '../shared/declarations.js';
import type { DevicesService, IdentityService, NotificationSettingsService } from './ports.js';

export const identityDeclarations = {
  createUser: 'system',
  linkOrCreateUser: 'system',
  sendPasswordReset: 'system',
  sendPasswordChanged: 'system',
  sendMagicLink: 'system',
  getUserByExternalId: 'system',
  getUserByEmail: 'system',
  getUserById: 'system',
  updateUser: 'system',
  profileOf: 'member',
  displayName: 'system',
  updateProfile: 'member',
  withdrawOrgPhoto: 'system',
} as const satisfies Declarations<IdentityService>;

export const devicesDeclarations = {
  register: 'member',
  list: 'member',
  remove: 'member',
  activeDevices: 'system',
  withActiveDevices: 'system',
  removeDead: 'system',
  pushConfig: 'member',
} as const satisfies Declarations<DevicesService>;

export const notificationSettingsDeclarations = {
  get: 'system',
  getMany: 'system',
  set: 'member',
  switchedOn: 'system',
} as const satisfies Declarations<NotificationSettingsService>;
