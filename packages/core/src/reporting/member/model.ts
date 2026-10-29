// reporting/member — read model. Reuses the content domain's Course/Module
// entities (identical wire shape); adds the enrollment reference the service
// resolves against the content service.
import type { NotificationKind } from '../../identity/index.js';

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

/** One of the viewer's notifications, with the names of what it refers to.
 *  A post or chat the viewer can no longer see comes back null. */
export interface NotificationView {
  id: string;
  kind: NotificationKind;
  createdAt: Date;
  readAt: Date | null;
  actor: { orgUserId: string; displayName: string | null; imageUrl: string | null } | null;
  community: { id: string; title: string } | null;
  space: { id: string; name: string } | null;
  post: { id: string; title: string } | null;
  commentId: string | null;
  chat: { id: string; title: string } | null;
  messageId: string | null;
}

export interface NotificationsView {
  rows: NotificationView[];
  total: number;
  page: number;
  pageSize: number;
  unreadCount: number;
}
