import type { Actor } from '../../shared/actor.js';
import type {
  ActivityView,
  CommunityHome,
  CommunityHomeSpace,
  CourseProgressView,
  CourseView,
  DirectoryEntry,
  DirectoryRow,
  DownloadFile,
  DownloadView,
  Module,
  NotificationView,
  NotificationsView,
} from './model.js';
import type { Notification } from '../../identity/index.js';

export interface MemberReportService {
  listCourses(orgId: string, orgUserId: string): Promise<CourseView[]>;
  getCourse(orgId: string, orgUserId: string, courseId: string): Promise<CourseView | null>;
  listModules(orgId: string, orgUserId: string, courseId: string): Promise<Module[] | null>;
  listActivities(
    orgId: string,
    orgUserId: string,
    courseId: string,
  ): Promise<ActivityView[] | null>;
  courseProgress(
    orgId: string,
    orgUserId: string,
    courseId: string,
  ): Promise<CourseProgressView | null>;
  listDownloads(orgId: string, orgUserId: string): Promise<DownloadView[]>;
  getDownload(
    orgId: string,
    orgUserId: string,
    downloadId: string,
  ): Promise<{ download: DownloadView; assets: DownloadFile[] } | null>;
  /** Signed URL of a course, download or community thumbnail: published, or staff. */
  thumbnailFile(
    orgId: string,
    actor: Actor,
    owner: 'course' | 'download' | 'community',
    id: string,
  ): Promise<string | null>;
  /** Signed URL of an asset the activity links, for a student who can open its course. */
  activityFile(
    orgId: string,
    actor: Actor,
    activityId: string,
    assetId: string,
  ): Promise<string | null>;
  /** Signed download URL of a file in a download the student can open. */
  downloadFile(
    orgId: string,
    actor: Actor,
    downloadId: string,
    assetId: string,
  ): Promise<string | null>;
  /** Signed URL of an org user's profile photo, when it belongs to this org. */
  personImage(orgId: string, orgUserId: string): Promise<string | null>;
  directory(orgId: string, actor: Actor, communityId: string): Promise<DirectoryEntry[] | null>;
  communityHome(orgId: string, actor: Actor, communityId: string): Promise<CommunityHome | null>;
  communitySpace(
    orgId: string,
    actor: Actor,
    communityId: string,
    spaceId: string,
  ): Promise<CommunityHomeSpace | null>;
  notifications(
    orgId: string,
    actor: Actor,
    userId: string,
    query: { page: number; pageSize: number },
  ): Promise<NotificationsView>;
  /** One notification the way `notifications` lists it. */
  notificationView(
    orgId: string,
    actor: Actor,
    notification: Notification,
  ): Promise<NotificationView>;
}

export interface MemberReportRepository {
  directory(orgId: string, communityId: string): Promise<DirectoryRow[]>;
  spaceMemberCounts(orgId: string, communityId: string): Promise<Record<string, number>>;
  people(orgId: string, orgUserIds: string[]): Promise<DirectoryRow[]>;
}
