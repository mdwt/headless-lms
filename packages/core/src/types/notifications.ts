import type { EmailTemplateId } from './email-templates.js';
import type { JsonValue } from './shared.js';

export type Reason =
  | 'subject'
  | 'post_author'
  | 'comment_author'
  | 'message_author'
  | 'follower'
  | 'thread_participant'
  | 'mentioned'
  | 'participant'
  | 'space_member'
  | 'community_member'
  | 'course_member'
  | 'moderator';

export type Scope = 'org' | 'community' | 'space' | 'chat';

export interface SubjectRef {
  type:
    | 'post'
    | 'comment'
    | 'chat'
    | 'message'
    | 'space'
    | 'community'
    | 'course'
    | 'download'
    | 'event'
    | 'bundle'
    | 'activity';
  id: string;
}

export interface NotificationTypeDeclaration {
  type: string;
  scopes: Scope[];
  reasons: Reason[];
  display: Partial<Record<Scope, string[]>>;
  email?: Partial<
    Record<
      Scope,
      { template: EmailTemplateId; byReason?: Partial<Record<Reason, EmailTemplateId>> }
    >
  >;
  push?: Partial<Record<Scope, { title: string; body: string }>>;
}

export interface NotificationCategory {
  key: string;
  covers: { type: string; reasons: Reason[] }[];
  channels: Record<string, { default: boolean; locked: boolean }>;
  perSpace?: boolean;
  spaceDefaults?: Record<string, Record<string, boolean>>;
}

export interface StoredNotification {
  id: string;
  orgId: string;
  userId: string;
  type: string;
  scope: Scope;
  reasons: Reason[];
  matchedReason: Reason;
  category: string;
  communityId: string | null;
  spaceId: string | null;
  actorId: string | null;
  subject: SubjectRef | null;
  parent: SubjectRef | null;
  display: Record<string, JsonValue>;
  createdAt: Date;
}

export type DeliveryStatus = 'pending' | 'sent' | 'failed';

export interface Delivery {
  id: string;
  notificationId: string;
  channel: string;
  status: DeliveryStatus;
  lastError: string | null;
  createdAt: Date;
  sentAt: Date | null;
}

export interface StoredSetting {
  communityId: string | null;
  spaceId: string | null;
  category: string;
  channel: string;
  enabled: boolean;
}

export type SettingsScope = { communityId: string } | 'org';

export interface PushDevice {
  id: string;
  provider: 'apns' | 'fcm' | 'webpush';
  token: string;
  p256dh: string | null;
  auth: string | null;
  appId: string | null;
  environment: 'production' | 'sandbox' | null;
}

export interface PushMessage {
  title: string;
  body: string;
  data: {
    notificationId: string;
    type: string;
    subject: SubjectRef | null;
    parent: SubjectRef | null;
    communityId: string | null;
    spaceId: string | null;
    courseId: string | null;
  };
}

export interface ChannelRecipient {
  email?: string;
  devices?: PushDevice[];
  address?: JsonValue;
}

export interface DeliveryResult {
  accepted: boolean;
  deadDeviceIds: string[];
  error?: string;
}

export interface NotificationFilter {
  scope?: 'org' | 'community';
  communityId?: string;
  includeOrg?: boolean;
  category?: string[];
  reason?: Reason[];
  type?: string[];
  unread?: boolean;
}

export interface RecipientList {
  type: string;
  scope: Scope;
  actorId: string | null;
  communityId: string | null;
  spaceId: string | null;
  subject: SubjectRef | null;
  parent: SubjectRef | null;
  display: Record<string, JsonValue>;
  recipients?: { orgUserId: string; userId: string; reasons: Reason[] }[];
  audience?: { reason: 'space_member'; spaceId: string; exclude: string[] };
}

export type PushProvider = PushDevice['provider'];

export interface DeviceView extends PushDevice {
  lastSeenAt: Date;
}

export interface PushConfig {
  apns?: { teamId: string; keyId: string; key: string; bundleIds: string[] };
  fcm?: { serviceAccount: Record<string, unknown> };
  webpush?: { publicKey: string; privateKey: string; subject: string };
}
