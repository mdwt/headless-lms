// reporting/member — read model. Reuses the content domain's Course/Module
// entities (identical wire shape); adds the enrollment reference the service
// resolves against the content service.
export type { Activity, Course, Module, Download, DownloadAsset } from '../../content/index.js';

/** An active-entitlement pointer: the org + content item a student may consume. */
export interface ContentRef {
  orgId: string;
  contentId: string;
}

/** Per-course progress for the student surface. Derived on read against the
 *  current published structure — never stored. */
export interface DirectoryEntry {
  orgUserId: string;
  userId: string;
  role: string;
  displayName: string | null;
  headline: string | null;
  bio: string | null;
  imageAssetId: string | null;
}

export interface CommunityHomeSpace {
  id: string;
  name: string;
  memberCount: number;
  open: boolean;
  accessRule: 'all_members' | 'by_request' | 'by_invite';
}

export interface CommunityHome {
  communityId: string;
  title: string;
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
