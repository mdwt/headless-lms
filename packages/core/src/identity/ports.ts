import type { User, UserProfile, UserProfileView } from './model.js';
import type { CreateUserInput, UpdateUserInput } from './types.js';
import type {
  DeviceView,
  JsonValue,
  NotificationCategory,
  PushDevice,
  PushProvider,
  SettingsScope,
  StoredSetting,
} from '../types/index.js';
import type { OutboxAppender, UnitOfWork } from '../shared/ports.js';
import type { Actor } from '../shared/actor.js';

export interface UpdateProfileInput {
  displayName?: string | null;
  headline?: string | null;
  bio?: string | null;
  imageAssetId?: string | null;
  extra?: JsonValue;
}

export interface ProfilePatch extends UpdateProfileInput {
  imageAssetOrgId?: string | null;
}

export interface UserProvisioner {
  createUser(input: CreateUserInput): Promise<User>;
  /** Auth signup entry point. Claims a person provisioned at invite time by
   *  stamping `externalId`; creates the person when the email is unknown.
   *  Throws ConflictError when the email is already linked to an account. */
  linkOrCreateUser(input: CreateUserInput): Promise<User>;
  sendPasswordReset(input: { email: string; url: string }): Promise<void>;
  sendPasswordChanged(input: { email: string }): Promise<void>;
  sendMagicLink(input: { email: string; url: string }): Promise<void>;
}

/** Resolves an auth account to the domain person. Used by the organizations
 *  context at invite acceptance, so core never reads the auth schema. */
export interface UserResolver {
  getUserByExternalId(externalId: string): Promise<User | null>;
  /** A hit says a person exists, NOT that they can sign in — provisioned
   *  students have no account until `externalId` is filled in. */
  getUserByEmail(email: string): Promise<User | null>;
  getUserById(id: string): Promise<User | null>;
}

/** Corrects the person an admin named. Throws ConflictError when a new address
 *  already belongs to somebody else. */
export interface UserEditor {
  updateUser(id: string, input: UpdateUserInput): Promise<User>;
}

/** Inbound HTTP headers carrying the session, forwarded to the auth provider. */
export type AuthHeaders = Record<string, string | string[] | undefined>;

/** Writes to a live session, fulfilled by the auth provider.  */
export interface SessionAdmin {
  /** Points the caller's current session at `orgId`.  */
  stampActiveOrganization(headers: AuthHeaders, orgId: string): Promise<boolean>;
}

// Inbound port (use cases the service exposes).
export interface IdentityService extends UserProvisioner, UserResolver, UserEditor {
  profileOf(actor: MemberActor): Promise<UserProfileView>;
  displayName(userId: string | null): Promise<string>;
  updateProfile(patch: UpdateProfileInput, actor: MemberActor): Promise<UserProfileView>;
  withdrawOrgPhoto(orgId: string, orgUserId: string): Promise<void>;
}

// Outbound port (persistence contract the repository fulfils).
export interface IdentityRepository {
  insertUser(input: CreateUserInput): Promise<User>;
  updateUser(id: string, input: UpdateUserInput): Promise<User | null>;
  findUserById(id: string): Promise<User | null>;
  findUserByExternalId(externalId: string): Promise<User | null>;
  findUserByEmail(email: string): Promise<User | null>;
  findProfile(userId: string): Promise<UserProfile | null>;
  upsertProfile(userId: string, patch: ProfilePatch): Promise<UserProfile>;
}

export interface IdentityTxScope {
  identity: IdentityRepository;
  outbox: OutboxAppender;
}

export type IdentityUnitOfWork = UnitOfWork<IdentityTxScope>;

export type MemberActor = Actor & { userId: string };

export interface SettingChange {
  category: string;
  spaceId?: string;
  channel: string;
  enabled: boolean | null;
}

export interface NotificationSettingsService {
  get(orgId: string, userId: string, scope: SettingsScope): Promise<StoredSetting[]>;
  getMany(
    orgId: string,
    userIds: string[],
    scope: SettingsScope,
    categories: string[],
  ): Promise<Record<string, StoredSetting[]>>;
  set(scope: SettingsScope, changes: SettingChange[], actor: MemberActor): Promise<void>;
  switchedOn(
    orgId: string,
    communityId: string,
    category: string,
    spaceId: string | null,
  ): Promise<string[]>;
}

export interface NotificationCategoryReader {
  communityList(orgId: string, communityId: string): Promise<NotificationCategory[]>;
  orgList(orgId: string): Promise<NotificationCategory[]>;
}

export interface CommunityAccessReader {
  canOpen(orgId: string, actor: Actor, communityId: string): Promise<boolean>;
}

export interface SettingKey {
  communityId: string | null;
  spaceId: string | null;
  category: string;
  channel: string;
}

export interface NotificationSettingsRepository {
  forUsers(
    orgId: string,
    userIds: string[],
    communityId: string | null,
    categories: string[] | null,
  ): Promise<(StoredSetting & { userId: string })[]>;
  apply(
    orgId: string,
    userId: string,
    upserts: (SettingKey & { enabled: boolean })[],
    deletes: SettingKey[],
    at: Date,
  ): Promise<void>;
  switchedOn(
    orgId: string,
    communityId: string,
    category: string,
    spaceId: string | null,
  ): Promise<string[]>;
}

export interface DeviceRegistration {
  provider: PushProvider;
  token: string;
  keys?: { p256dh: string; auth: string };
  appId?: string;
  environment?: 'production' | 'sandbox';
}

export interface DevicesService {
  register(input: DeviceRegistration, actor: MemberActor): Promise<PushDevice>;
  list(actor: MemberActor): Promise<DeviceView[]>;
  remove(deviceId: string, actor: MemberActor): Promise<void>;
  activeDevices(orgId: string, userId: string, since: Date): Promise<PushDevice[]>;
  withActiveDevices(orgId: string, userIds: string[], since: Date): Promise<string[]>;
  removeDead(orgId: string, deviceIds: string[]): Promise<void>;
  pushConfig(): { vapidPublicKey: string | null };
}

export interface NewDevice {
  userId: string;
  provider: PushProvider;
  token: string;
  p256dh: string | null;
  auth: string | null;
  appId: string | null;
  environment: 'production' | 'sandbox' | null;
}

export interface DevicesRepository {
  upsert(orgId: string, device: NewDevice, at: Date): Promise<DeviceView>;
  listForUser(orgId: string, userId: string, since: Date | null): Promise<DeviceView[]>;
  usersWithDevices(orgId: string, userIds: string[], since: Date): Promise<string[]>;
  deleteOwn(orgId: string, userId: string, deviceId: string): Promise<boolean>;
  deleteMany(orgId: string, deviceIds: string[]): Promise<void>;
}
