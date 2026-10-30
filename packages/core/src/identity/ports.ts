import type {
  Notification,
  NotificationKind,
  NotificationPreference,
  User,
  UserProfile,
  UserProfileView,
} from './model.js';
import type { CreateUserInput, UpdateUserInput } from './types.js';
import type { JsonValue } from '../types/index.js';
import type { OutboxAppender, UnitOfWork } from '../shared/ports.js';

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

export interface NewNotification {
  userId: string;
  kind: NotificationKind;
  actorOrgUserId: string | null;
  communityId: string | null;
  spaceId: string | null;
  postId: string | null;
  commentId: string | null;
  chatId: string | null;
  messageId: string | null;
}

export interface NotificationsQuery {
  page: number;
  pageSize: number;
}

export interface NotificationPage {
  rows: Notification[];
  total: number;
  page: number;
  pageSize: number;
  unreadCount: number;
}

/** What automations calls to tell people. */
export interface NotificationDesk {
  notify(orgId: string, notifications: NewNotification[]): Promise<void>;
  preferencesFor(
    orgId: string,
    userIds: string[],
    kind: NotificationKind,
  ): Promise<Record<string, NotificationPreference>>;
}

/** A person's own notifications and preferences. */
export interface NotificationInbox {
  listNotifications(
    orgId: string,
    userId: string,
    query: NotificationsQuery,
  ): Promise<NotificationPage>;
  markNotificationRead(
    orgId: string,
    userId: string,
    notificationId: string,
  ): Promise<Notification>;
  markAllNotificationsRead(orgId: string, userId: string): Promise<{ updated: number }>;
  notificationPreferences(orgId: string, userId: string): Promise<NotificationPreference[]>;
  setNotificationPreferences(
    orgId: string,
    userId: string,
    preferences: NotificationPreference[],
  ): Promise<NotificationPreference[]>;
}

export interface NotificationService extends NotificationDesk, NotificationInbox {}

// Inbound port (use cases the service exposes).
export interface IdentityService extends UserProvisioner, UserResolver, UserEditor {
  profileOf(orgId: string, userId: string): Promise<UserProfileView>;
  displayName(userId: string | null): Promise<string>;
  updateProfile(
    orgId: string,
    userId: string,
    actorUserId: string,
    orgUserId: string,
    patch: UpdateProfileInput,
  ): Promise<UserProfileView>;
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

export interface NotificationsRepository {
  insert(orgId: string, rows: Notification[]): Promise<void>;
  page(
    orgId: string,
    userId: string,
    query: NotificationsQuery,
  ): Promise<{ rows: Notification[]; total: number; unreadCount: number }>;
  markRead(
    orgId: string,
    userId: string,
    notificationId: string,
    at: Date,
  ): Promise<Notification | null>;
  markAllRead(orgId: string, userId: string, at: Date): Promise<number>;
  preferences(
    orgId: string,
    userIds: string[],
  ): Promise<(NotificationPreference & { userId: string })[]>;
  upsertPreferences(
    orgId: string,
    userId: string,
    preferences: NotificationPreference[],
  ): Promise<void>;
}

export interface IdentityTxScope {
  identity: IdentityRepository;
  outbox: OutboxAppender;
}

export type IdentityUnitOfWork = UnitOfWork<IdentityTxScope>;
