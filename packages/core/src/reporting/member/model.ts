// reporting/member — read model. Reuses the content domain's Course/Module
// entities (identical wire shape); adds the enrollment reference the service
// resolves against the content service.
export type {
  ActivityView,
  CourseView,
  DownloadFile,
  DownloadView,
  Module,
} from '../../content/index.js';

/** An active-entitlement pointer: the org + content item a student may consume. */
export interface ContentRef {
  orgId: string;
  contentId: string;
}

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

export interface CommunityHomeSpace {
  id: string;
  name: string;
  description: string | null;
  memberCount: number;
  capacity: number | null;
  open: boolean;
  accessRule: 'all_members' | 'by_request' | 'by_invite';
  standing: 'open' | 'member' | 'requested' | 'invited' | 'full' | 'none';
  settings: { comments: boolean; reactions: boolean; requireReview: boolean };
  topics: { id: string; name: string }[];
  links: CommunityHomeLink[];
}

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
