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
  EventAttendee,
  EventAttendeeRow,
  EventReader,
  MemberEvent,
  MemberEventsQuery,
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
  getCourse(courseId: string, actor: Actor): Promise<CourseView>;
  listModules(courseId: string, actor: Actor): Promise<Module[]>;
  listActivities(courseId: string, actor: Actor): Promise<ActivityView[]>;
  courseProgress(courseId: string, actor: Actor): Promise<CourseProgressView>;
  listDownloads(actor: Actor): Promise<DownloadView[]>;
  getDownload(
    downloadId: string,
    actor: Actor,
  ): Promise<{ download: DownloadView; assets: DownloadFile[] }>;
  /** Signed URL of a course, download or community thumbnail: published, or the item's read
   *  permission. An event's when the caller can read the event. */
  thumbnailFile(
    owner: 'course' | 'download' | 'community' | 'event',
    id: string,
    actor: Actor,
  ): Promise<string>;
  /** The event as the caller may see it, with their viewer flags. */
  getEvent(eventId: string, actor: Actor): Promise<MemberEvent>;
  /** The published and canceled events the caller can read. */
  listEvents(query: MemberEventsQuery, actor: Actor): Promise<Page<MemberEvent>>;
  /** The event as an iCalendar file. */
  eventCalendar(eventId: string, actor: Actor): Promise<string>;
  /** The people attending the event, for a holder of `events:read` on it. */
  eventAttendees(
    eventId: string,
    query: { page: number; pageSize: number },
    actor: Actor,
  ): Promise<Page<EventAttendee>>;
  /** Signed download URL of a file attached to an event the caller can open. */
  eventFile(eventId: string, assetId: string, actor: Actor): Promise<string>;
  /** Signed URL of an asset the activity links, for a person who can open its course. */
  activityFile(activityId: string, assetId: string, actor: Actor): Promise<string>;
  /** Signed download URL of a file in a download the person can open. */
  downloadFile(downloadId: string, assetId: string, actor: Actor): Promise<string>;
  /** Signed URL of an org user's profile photo, when it belongs to this org. */
  personImage(orgUserId: string, actor: Actor): Promise<string>;
  directory(
    communityId: string,
    query: DirectoryQuery,
    actor: Actor,
  ): Promise<Page<DirectoryEntry>>;
  communityHome(communityId: string, actor: Actor): Promise<CommunityHome>;
  communitySpace(communityId: string, spaceId: string, actor: Actor): Promise<CommunityHomeSpace>;
  notifications(
    filter: NotificationFilter,
    page: { page: number; pageSize: number },
    actor: MemberActor,
  ): Promise<NotificationsView>;
  notification(notificationId: string, actor: MemberActor): Promise<NotificationView>;
  notificationUnreadCounts(actor: MemberActor): Promise<NotificationUnreadCounts>;
  /** The person's notification settings in a community they can open, resolved per channel. */
  communityNotificationSettings(
    communityId: string,
    actor: MemberActor,
  ): Promise<CommunityNotificationSettingsView>;
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
  /** The people attending an event, directly or through a bundle, by grant date. */
  eventAttendees(
    orgId: string,
    eventId: string,
    page: { page: number; pageSize: number },
  ): Promise<Page<EventAttendeeRow>>;
  /** Ids of the published and canceled events the reader can read, in the query's order. */
  events(
    orgId: string,
    query: MemberEventsQuery,
    reader: EventReader,
    now: Date,
  ): Promise<Page<string>>;
}
