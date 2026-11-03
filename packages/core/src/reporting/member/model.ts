import type { ResolvedChannel } from '../../shared/notification-settings.js';
// reporting/member — read model. Reuses the content domain's Course/Module
// entities (identical wire shape); adds the enrollment reference the service
// resolves against the content service.
import type { JsonValue, Reason, Scope, SubjectRef, SubscriptionView } from '../../types/index.js';

export type {
  ActivityView,
  CourseView,
  DownloadFile,
  DownloadView,
  Module,
} from '../../content/index.js';

/** Per-course progress for the student surface. Derived on read against the
 *  current published structure — never stored. */
export interface DirectoryRow {
  orgUserId: string;
  userId: string;
  role: string;
  displayName: string | null;
  headline: string | null;
  bio: string | null;
  imageAssetId: string | null;
}

export interface DirectoryQuery {
  page: number;
  pageSize: number;
  search?: string;
}

export interface DirectoryEntry extends DirectoryRow {
  imageUrl: string | null;
}

export interface CommunityHomeLink {
  id: string;
  contentId: string;
  type: 'course' | 'download' | 'community';
  title: string;
}

interface CommunityHomeSpaceBase {
  id: string;
  name: string;
  memberCount: number;
  accessRule: 'all_members' | 'by_request' | 'by_invite';
  standing: 'open' | 'member' | 'requested' | 'invited' | 'full' | 'none';
}

/** A space the viewer can see but not open: enough to request, accept or ask. */
export interface LockedCommunitySpace extends CommunityHomeSpaceBase {
  locked: true;
}

export interface OpenCommunitySpace extends CommunityHomeSpaceBase {
  locked: false;
  description: string | null;
  capacity: number | null;
  settings: { comments: boolean; reactions: boolean; requireReview: boolean };
  topics: { id: string; name: string }[];
  links: CommunityHomeLink[];
  subscription: SubscriptionView | null;
}

export type CommunityHomeSpace = LockedCommunitySpace | OpenCommunitySpace;

export interface CommunityHome {
  communityId: string;
  title: string;
  description: string;
  thumbnailUrl: string | null;
  dm: {
    enabled: boolean;
    memberToMember: boolean;
    memberToStaff: boolean;
    staffToAnyone: boolean;
    firstMessageIsRequest: boolean;
    groupChats: boolean;
    groupSize: number;
  };
  spaces: CommunityHomeSpace[];
}

export interface CourseProgressView {
  /** Keyed by activity id; absent key = not started. */
  activities: Record<string, 'in-progress' | 'completed'>;
  /** Integer 0–100: completed ÷ current published activities, rounded. */
  percent: number;
  /** The course target's own record says so. */
  completed: boolean;
  /** Per-activity reported state (the record's position map); absent key = none reported. */
  positions: Record<string, unknown>;
}

export interface NotificationItemView {
  type: SubjectRef['type'];
  id: string;
  title?: string;
  excerpt?: string;
}

export interface NotificationView {
  id: string;
  type: string;
  scope: Scope;
  reasons: Reason[];
  category: string;
  display: Record<string, JsonValue>;
  community: { id: string; title: string } | null;
  space: { id: string; name: string } | null;
  actor: { orgUserId: string; name: string | null; imageUrl: string | null } | null;
  subject: NotificationItemView | null;
  parent: NotificationItemView | null;
  createdAt: Date;
  readAt: Date | null;
}

export interface NotificationUnreadCounts {
  org: number;
  communities: { communityId: string; unread: number }[];
}

export interface NotificationsView {
  rows: NotificationView[];
  total: number;
  page: number;
  pageSize: number;
  unreadCount: number;
}

export interface NotificationSettingsCategoryView {
  key: string;
  perSpace: boolean;
  channels: ResolvedChannel[];
  spaces?: { spaceId: string; channels: ResolvedChannel[] }[];
}

export interface CommunityNotificationSettingsView {
  communityId: string;
  categories: NotificationSettingsCategoryView[];
}

export interface OrgNotificationSettingsView {
  categories: NotificationSettingsCategoryView[];
}
