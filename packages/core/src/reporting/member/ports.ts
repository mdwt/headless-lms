import type { Actor } from '../../shared/actor.js';
import type { Page } from '../../types/index.js';
import type {
  ActivityView,
  CommunityHome,
  CommunityHomeSpace,
  CourseProgressView,
  CourseView,
  DirectoryEntry,
  DirectoryQuery,
  DirectoryRow,
  DownloadFile,
  DownloadView,
  MemberViewer,
  Module,
  NotificationView,
  NotificationsView,
  NotificationUnreadCounts,
  CommunityNotificationSettingsView,
  OrgNotificationSettingsView,
} from './model.js';
import type { NotificationFilter } from '../../types/index.js';
import type { MemberActor } from '../../identity/index.js';

export interface MemberReportService {
  /** Who the caller is in the org, and the permissions they hold. */
  viewer(actor: Actor): MemberViewer;
  listCourses(actor: Actor): Promise<CourseView[]>;
  getCourse(courseId: string, actor: Actor): Promise<CourseView | null>;
  listModules(courseId: string, actor: Actor): Promise<Module[] | null>;
  listActivities(courseId: string, actor: Actor): Promise<ActivityView[] | null>;
  courseProgress(courseId: string, actor: Actor): Promise<CourseProgressView | null>;
  listDownloads(actor: Actor): Promise<DownloadView[]>;
  getDownload(
    downloadId: string,
    actor: Actor,
  ): Promise<{ download: DownloadView; assets: DownloadFile[] } | null>;
  /** Signed URL of a course, download or community thumbnail: published, or the item's read permission. */
  thumbnailFile(
    owner: 'course' | 'download' | 'community',
    id: string,
    actor: Actor,
  ): Promise<string | null>;
  /** Signed URL of an asset the activity links, for a person who can open its course. */
  activityFile(activityId: string, assetId: string, actor: Actor): Promise<string | null>;
  /** Signed download URL of a file in a download the person can open. */
  downloadFile(downloadId: string, assetId: string, actor: Actor): Promise<string | null>;
  /** Signed URL of an org user's profile photo, when it belongs to this org. */
  personImage(orgUserId: string, actor: Actor): Promise<string | null>;
  directory(
    communityId: string,
    query: DirectoryQuery,
    actor: Actor,
  ): Promise<Page<DirectoryEntry> | null>;
  communityHome(communityId: string, actor: Actor): Promise<CommunityHome | null>;
  communitySpace(
    communityId: string,
    spaceId: string,
    actor: Actor,
  ): Promise<CommunityHomeSpace | null>;
  notifications(
    filter: NotificationFilter,
    page: { page: number; pageSize: number },
    actor: MemberActor,
  ): Promise<NotificationsView>;
  notification(notificationId: string, actor: MemberActor): Promise<NotificationView | null>;
  notificationUnreadCounts(actor: MemberActor): Promise<NotificationUnreadCounts>;
  /** The person's notification settings in a community they can open, resolved per channel. */
  communityNotificationSettings(
    communityId: string,
    actor: MemberActor,
  ): Promise<CommunityNotificationSettingsView | null>;
  /** The person's notification settings for the org's categories. */
  orgNotificationSettings(actor: MemberActor): Promise<OrgNotificationSettingsView>;
}

export interface MemberReportRepository {
  directory(
    orgId: string,
    communityId: string,
    query: DirectoryQuery,
    readerIds: string[],
  ): Promise<Page<DirectoryRow>>;
  spaceMemberCounts(
    orgId: string,
    communityId: string,
    excluding: string[],
  ): Promise<Record<string, number>>;
  people(orgId: string, orgUserIds: string[]): Promise<DirectoryRow[]>;
}
