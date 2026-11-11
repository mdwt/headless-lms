import {
  eventSight,
  type ContentServicePort,
  type EventSight,
  type EventView,
  type SpaceDetail,
  type SpaceView,
} from '../../content/index.js';
import { NotFoundError } from '../../shared/errors.js';
import { seesSpace, type EntitlementsService, type SpaceMember } from '../../entitlements/index.js';
import type { ProgressService } from '../../progress/index.js';
import type { FileUrls } from '../../assets/index.js';
import type { OrganizationService } from '../../organizations/index.js';
import { PERMISSION_KEYS } from '../../types/schemas/organizations.js';
import type {
  ItemTitles as DiscussionItemTitles,
  SubscriptionService,
} from '../../discussion/index.js';
import type { ItemTitles as ContentItemTitles } from '../../content/index.js';
import type { MemberActor, NotificationSettingsService } from '../../identity/index.js';
import {
  applicableCategories,
  type ListedNotification,
  type NotificationsService,
} from '../../automations/index.js';
import type { ChannelRegistry, NotificationCategoryService } from '../../shared/ports.js';
import { resolveChannels } from '../../shared/notification-settings.js';
import { channelOrder } from '../../shared/notification-categories.js';
import type {
  NotificationCategory,
  NotificationFilter,
  StoredSetting,
  SubjectRef,
} from '../../types/index.js';
import type { Actor } from '../../shared/actor.js';
import type { EventFile, Page, Permission } from '../../types/index.js';
import type {
  ActivityView,
  CommunityHome,
  CommunityHomeLink,
  CommunityHomeSpace,
  CourseProgressView,
  CourseView,
  DirectoryEntry,
  DirectoryQuery,
  DownloadFile,
  DownloadView,
  EventAttendee,
  MemberEvent,
  MemberEventSummary,
  MemberEventsQuery,
  MemberViewer,
  Module,
  NotificationItemView,
  NotificationView,
  NotificationsView,
  NotificationUnreadCounts,
  CommunityNotificationSettingsView,
  NotificationSettingsCategoryView,
  OrgNotificationSettingsView,
  SettingsChannelView,
} from './model.js';
import type { MemberReportRepository, MemberReportService } from './ports.js';
import { eventCalendar } from './calendar.js';
import { attendeeFace, attendeeView, type EventFaces } from '../events/index.js';

function refKey(ref: SubjectRef): string {
  return `${ref.type}:${ref.id}`;
}

function itemView(
  ref: SubjectRef | null,
  titles: Record<string, { title: string; excerpt?: string }>,
): NotificationItemView | null {
  const found = ref ? titles[refKey(ref)] : undefined;
  if (!ref || !found) {
    return null;
  }
  return found.excerpt !== undefined
    ? { type: ref.type, id: ref.id, excerpt: found.excerpt }
    : { type: ref.type, id: ref.id, title: found.title };
}

function isActivityPublished(settings: unknown): boolean {
  return (settings as { published?: boolean } | null)?.published !== false;
}

type MemberAccess = Pick<
  EntitlementsService,
  | 'isCommunityMember'
  | 'openSpaceIds'
  | 'spaceStandings'
  | 'hasAccess'
  | 'listAccessibleContent'
  | 'openCommunityIds'
  | 'opensEverySpace'
  | 'everySpaceOpeners'
>;

type MemberContent = Pick<
  ContentServicePort,
  | 'findCourse'
  | 'listCourseModules'
  | 'listCourseActivityViews'
  | 'listCourseActivities'
  | 'findDownload'
  | 'listDownloadAssets'
  | 'findCommunity'
  | 'listSpaces'
  | 'getSpace'
  | 'findEvent'
  | 'findEvents'
  | 'eventFilesFor'
>;

type MemberPeople = Pick<OrganizationService, 'systemActor' | 'permissionsOfMany' | 'holders'>;

type Owner = 'course' | 'download' | 'community' | 'event';

const READ_OF = {
  course: 'courses:read',
  download: 'downloads:read',
  community: 'communities:read',
  event: 'events:read',
} as const satisfies Record<Owner, Permission>;

const EVENT_FACES = 10;

interface SeenEvent {
  event: EventView;
  sight: EventSight;
  attending: boolean;
}

export type MemberReportServiceParams = {
  repo: MemberReportRepository;
  content: MemberContent;
  progress: Pick<ProgressService, 'get' | 'listByTargets'>;
  fileUrls: FileUrls;
  access: MemberAccess;
  people: MemberPeople;
  notifications: Pick<NotificationsService, 'list' | 'get' | 'unreadCounts'>;
  titles: { discussion: DiscussionItemTitles; content: ContentItemTitles };
  subscriptions: Pick<SubscriptionService, 'viewerSubscriptions'>;
  notificationCategories: {
    community: Pick<NotificationCategoryService, 'get'>;
    org: Pick<NotificationCategoryService, 'get'>;
  };
  notificationSettings: Pick<NotificationSettingsService, 'get'>;
  channels: Pick<ChannelRegistry, 'list'>;
  studentPortalUrl: string;
  now?: () => Date;
};

export class MemberReportServiceImpl implements MemberReportService {
  private readonly repo: MemberReportRepository;
  private readonly content: MemberContent;
  private readonly progress: Pick<ProgressService, 'get' | 'listByTargets'>;
  private readonly fileUrls: FileUrls;
  private readonly access: MemberAccess;
  private readonly people: MemberPeople;
  private readonly notificationList: Pick<NotificationsService, 'list' | 'get' | 'unreadCounts'>;
  private readonly titles: MemberReportServiceParams['titles'];
  private readonly subscriptions: Pick<SubscriptionService, 'viewerSubscriptions'>;
  private readonly notificationCategories: MemberReportServiceParams['notificationCategories'];
  private readonly notificationSettings: Pick<NotificationSettingsService, 'get'>;
  private readonly channels: Pick<ChannelRegistry, 'list'>;
  private readonly studentPortalUrl: string;
  private readonly now: () => Date;

  constructor(params: MemberReportServiceParams) {
    this.repo = params.repo;
    this.content = params.content;
    this.progress = params.progress;
    this.fileUrls = params.fileUrls;
    this.access = params.access;
    this.people = params.people;
    this.notificationList = params.notifications;
    this.titles = params.titles;
    this.subscriptions = params.subscriptions;
    this.notificationCategories = params.notificationCategories;
    this.notificationSettings = params.notificationSettings;
    this.channels = params.channels;
    this.studentPortalUrl = params.studentPortalUrl.replace(/\/+$/, '');
    this.now = params.now ?? (() => new Date());
  }

  private system(actor: Actor): Actor {
    return this.people.systemActor(actor.orgId);
  }

  viewer(actor: Actor): MemberViewer {
    const role = actor.permissions.roleOn();
    return {
      orgUserId: actor.id,
      orgRole: { key: role.key, name: role.name },
      permissions: PERMISSION_KEYS.filter((p) => actor.permissions.anywhere(p)),
      orgPermissions: PERMISSION_KEYS.filter((p) => actor.permissions.has(p)),
    };
  }

  async communityNotificationSettings(
    communityId: string,
    actor: MemberActor,
  ): Promise<CommunityNotificationSettingsView> {
    if (!(await this.access.isCommunityMember(communityId, actor))) {
      throw new NotFoundError('Community', communityId);
    }
    const orgId = actor.orgId;
    const system = this.system(actor);
    const [list, settings, spaceIds, spaces, community] = await Promise.all([
      this.notificationCategories.community.get(communityId, system),
      this.notificationSettings.get(orgId, actor.userId, { communityId }),
      this.access.openSpaceIds(communityId, actor),
      this.content.listSpaces(communityId, system),
      this.content.findCommunity(communityId, system),
    ]);
    const open = new Set(spaceIds);
    return {
      communityId,
      digest: community?.settings.digest ?? null,
      categories: this.settingsView(
        applicableCategories(list.categories, actor.permissions, { communityId }),
        settings,
        spaces
          .filter((space) => open.has(space.id))
          .map((space) => ({ spaceId: space.id, name: space.name })),
      ),
    };
  }

  async orgNotificationSettings(actor: MemberActor): Promise<OrgNotificationSettingsView> {
    const orgId = actor.orgId;
    const [list, settings] = await Promise.all([
      this.notificationCategories.org.get(orgId, this.system(actor)),
      this.notificationSettings.get(orgId, actor.userId, 'org'),
    ]);
    return {
      categories: this.settingsView(
        applicableCategories(list.categories, actor.permissions, 'org'),
        settings,
        [],
      ),
    };
  }

  private settingsView(
    categories: NotificationCategory[],
    settings: StoredSetting[],
    spaces: { spaceId: string; name: string }[],
  ): NotificationSettingsCategoryView[] {
    const configured = channelOrder(this.channels.list());
    const channelsAt = (
      category: NotificationCategory,
      spaceId: string | null,
    ): SettingsChannelView[] => {
      const withoutLevel = settings.filter(
        (setting) => setting.category !== category.key || setting.spaceId !== spaceId,
      );
      const fallback = new Map(
        resolveChannels(category, withoutLevel, spaceId, configured).map((resolved) => [
          resolved.channel,
          resolved.enabled,
        ]),
      );
      return resolveChannels(category, settings, spaceId, configured).map((resolved) => ({
        ...resolved,
        default: fallback.get(resolved.channel) ?? resolved.enabled,
      }));
    };
    return categories.map((category) => {
      const perSpace = category.perSpace === true;
      const view: NotificationSettingsCategoryView = {
        key: category.key,
        perSpace,
        channels: channelsAt(category, null),
      };
      if (perSpace) {
        view.spaces = spaces.map(({ spaceId, name }) => ({
          spaceId,
          name,
          channels: channelsAt(category, spaceId),
        }));
      }
      return view;
    });
  }

  async notifications(
    filter: NotificationFilter,
    page: { page: number; pageSize: number },
    actor: MemberActor,
  ): Promise<NotificationsView> {
    const listed = await this.notificationList.list(filter, page, actor);
    return {
      rows: await this.describeNotifications(actor, listed.items),
      total: listed.total,
      page: page.page,
      pageSize: page.pageSize,
      unreadCount: listed.unreadCount,
    };
  }

  async notification(notificationId: string, actor: MemberActor): Promise<NotificationView> {
    const found = await this.notificationList.get(notificationId, actor);
    const [view] = found ? await this.describeNotifications(actor, [found]) : [];
    if (!view) {
      throw new NotFoundError('Notification', notificationId);
    }
    return view;
  }

  async notificationUnreadCounts(actor: MemberActor): Promise<NotificationUnreadCounts> {
    const communityIds = await this.access.openCommunityIds(actor);
    return this.notificationList.unreadCounts(communityIds, actor);
  }

  private async describeNotifications(
    actor: Actor,
    rows: ListedNotification[],
  ): Promise<NotificationView[]> {
    const orgId = actor.orgId;
    const refs = rows.flatMap((row) => [
      ...(row.subject ? [row.subject] : []),
      ...(row.parent ? [row.parent] : []),
      ...(row.communityId ? [{ type: 'community' as const, id: row.communityId }] : []),
      ...(row.spaceId ? [{ type: 'space' as const, id: row.spaceId }] : []),
    ]);
    const actorIds = [...new Set(rows.flatMap((row) => row.actorId ?? []))];
    const [people, discussionTitles, contentTitles] = await Promise.all([
      this.repo.people(orgId, actorIds),
      this.titles.discussion.titlesFor(refs, actor),
      this.titles.content.titlesFor(refs, actor),
    ]);
    const titles = { ...contentTitles, ...discussionTitles };
    const personById = new Map(people.map((person) => [person.orgUserId, person]));
    return rows.map((row) => {
      const person = row.actorId ? personById.get(row.actorId) : undefined;
      const community = row.communityId ? titles[`community:${row.communityId}`] : undefined;
      const space = row.spaceId ? titles[`space:${row.spaceId}`] : undefined;
      return {
        id: row.id,
        type: row.type,
        scope: row.scope,
        reasons: row.reasons,
        matchedReason: row.matchedReason,
        category: row.category,
        display: row.display,
        community:
          row.communityId && community ? { id: row.communityId, title: community.title } : null,
        space: row.spaceId && space ? { id: row.spaceId, name: space.title } : null,
        actor: person
          ? {
              orgUserId: person.orgUserId,
              name: person.displayName,
              imageUrl: person.imageAssetId
                ? this.fileUrls.publicImage(orgId, person.orgUserId, person.imageAssetId)
                : null,
            }
          : null,
        subject: itemView(row.subject, titles),
        parent: itemView(row.parent, titles),
        createdAt: row.createdAt,
        readAt: row.readAt,
      };
    });
  }

  private async opensCourse(courseId: string, actor: Actor): Promise<CourseView | null> {
    const reads = actor.permissions.has('courses:read', courseId);
    if (!reads && !(await this.access.hasAccess(actor.orgId, actor.id, courseId))) {
      return null;
    }
    const course = await this.content.findCourse(courseId, this.system(actor));
    return course && (reads || course.status === 'published') ? course : null;
  }

  private async opensDownload(downloadId: string, actor: Actor): Promise<DownloadView | null> {
    const reads = actor.permissions.has('downloads:read', downloadId);
    if (!reads && !(await this.access.hasAccess(actor.orgId, actor.id, downloadId))) {
      return null;
    }
    const download = await this.content.findDownload(downloadId, this.system(actor));
    return download && (reads || download.status === 'published') ? download : null;
  }

  async listCourses(actor: Actor): Promise<CourseView[]> {
    const ids = await this.access.listAccessibleContent(actor.orgId, actor.id, 'course');
    const system = this.system(actor);
    const courses = await Promise.all(ids.map((id) => this.content.findCourse(id, system)));
    return courses.filter((c): c is CourseView => c !== null && c.status === 'published');
  }

  private async requireCourse(courseId: string, actor: Actor): Promise<CourseView> {
    const course = await this.opensCourse(courseId, actor);
    if (!course) {
      throw new NotFoundError('Course', courseId);
    }
    return course;
  }

  getCourse(courseId: string, actor: Actor): Promise<CourseView> {
    return this.requireCourse(courseId, actor);
  }

  async listModules(courseId: string, actor: Actor): Promise<Module[]> {
    await this.requireCourse(courseId, actor);
    return this.content.listCourseModules(courseId, this.system(actor));
  }

  async listActivities(courseId: string, actor: Actor): Promise<ActivityView[]> {
    await this.requireCourse(courseId, actor);
    const activities = await this.content.listCourseActivityViews(courseId, this.system(actor));
    return activities.filter((a) => isActivityPublished(a.settings));
  }

  async courseProgress(courseId: string, actor: Actor): Promise<CourseProgressView> {
    await this.requireCourse(courseId, actor);
    const orgId = actor.orgId;
    const courseActivities = await this.content.listCourseActivities(courseId, this.system(actor));
    const ids = courseActivities.filter((a) => isActivityPublished(a.settings)).map((a) => a.id);
    const records = await this.progress.listByTargets(orgId, actor.id, ids);
    const activities: CourseProgressView['activities'] = {};
    const positions: CourseProgressView['positions'] = {};
    let done = 0;
    for (const r of records) {
      if (r.targetType !== 'activity') {
        continue;
      }
      activities[r.targetId] = r.completedAt ? 'completed' : 'in-progress';
      if (r.completedAt) {
        done += 1;
      }
      if (r.position != null) {
        positions[r.targetId] = r.position;
      }
    }
    const courseRecord = await this.progress.get(orgId, {
      orgUserId: actor.id,
      targetType: 'course',
      targetId: courseId,
    });
    return {
      activities,
      percent: ids.length > 0 ? Math.round((done / ids.length) * 100) : 0,
      completed: courseRecord?.completedAt != null,
      positions,
    };
  }

  async listDownloads(actor: Actor): Promise<DownloadView[]> {
    const ids = await this.access.listAccessibleContent(actor.orgId, actor.id, 'download');
    const system = this.system(actor);
    const rows = await Promise.all(ids.map((id) => this.content.findDownload(id, system)));
    return rows.filter((d): d is DownloadView => d !== null && d.status === 'published');
  }

  async getDownload(
    downloadId: string,
    actor: Actor,
  ): Promise<{ download: DownloadView; assets: DownloadFile[] }> {
    const download = await this.opensDownload(downloadId, actor);
    if (!download) {
      throw new NotFoundError('Download', downloadId);
    }
    const assets = await this.content.listDownloadAssets(downloadId, this.system(actor));
    return { download, assets };
  }

  private async seeEvents(ids: string[], actor: Actor): Promise<SeenEvent[]> {
    if (ids.length === 0) {
      return [];
    }
    const system = this.system(actor);
    const [events, attended] = await Promise.all([
      this.content.findEvents(ids, system),
      ids.length === 1
        ? this.access
            .hasAccess(actor.orgId, actor.id, ids[0]!)
            .then((attending) => (attending ? [ids[0]!] : []))
        : this.access.listAccessibleContent(actor.orgId, actor.id, 'event'),
    ]);
    const attending = new Set(attended);
    const byId = new Map(events.map((event) => [event.id, event]));
    return ids.flatMap((id) => {
      const event = byId.get(id);
      if (!event) {
        return [];
      }
      const sight = eventSight(event, {
        canRead: actor.permissions.has('events:read', id),
        attending: attending.has(id),
      });
      return sight ? [{ event, sight, attending: attending.has(id) }] : [];
    });
  }

  private async requireEvent(eventId: string, actor: Actor): Promise<SeenEvent> {
    const [seen] = await this.seeEvents([eventId], actor);
    if (!seen) {
      throw new NotFoundError('Event', eventId);
    }
    return seen;
  }

  private async eventSummaries(
    seen: SeenEvent[],
    actor: Actor,
    now: Date,
  ): Promise<MemberEventSummary[]> {
    const ids = seen.map((item) => item.event.id);
    const attended = seen.filter((item) => item.attending).map((item) => item.event.id);
    const [faces, direct] = await Promise.all([
      this.repo.eventFaces(actor.orgId, ids, EVENT_FACES),
      attended.length > 0
        ? this.repo.directEventGrants(actor.orgId, actor.id, attended)
        : Promise.resolve([]),
    ]);
    const leaves = new Set(direct);
    return seen.map((item) =>
      this.eventSummary(
        item,
        faces[item.event.id] ?? { total: 0, rows: [] },
        leaves.has(item.event.id),
        actor,
        now,
      ),
    );
  }

  private eventSummary(
    seen: SeenEvent,
    faces: EventFaces,
    canLeave: boolean,
    actor: Actor,
    now: Date,
  ): MemberEventSummary {
    const { event, sight, attending } = seen;
    const id = event.id;
    const canOpen = sight !== 'public';
    const capacity = event.settings.capacity;
    const attendeeCount = faces.total;
    const ended = event.endsAt.getTime() <= now.getTime();
    const recording =
      sight === 'read' || (sight === 'attendee' && ended && event.settings.replay)
        ? event.recording
        : null;
    const writes = actor.permissions.has('events:write', id);
    const canManageAttendees = actor.permissions.has('access:write') || writes;
    return {
      orgId: event.orgId,
      id,
      type: event.type,
      title: event.title,
      thumbnailAssetId: event.thumbnailAssetId,
      thumbnailUrl: event.thumbnailUrl,
      status: event.status,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      timeZone: event.timeZone,
      location: canOpen ? event.location : null,
      recording,
      settings: {
        type: event.settings.type,
        capacity,
        replay: event.settings.replay,
      },
      attendeeCount,
      attendees: faces.rows.map((row) => attendeeFace(actor.orgId, row, this.fileUrls)),
      placesLeft: capacity === null ? null : Math.max(capacity - attendeeCount, 0),
      viewer: {
        attending,
        canRegister:
          event.status === 'published' &&
          !attending &&
          event.settings.type === 'public' &&
          event.startsAt.getTime() > now.getTime() &&
          (capacity === null || attendeeCount < capacity),
        canOpen,
        canLeave,
        canManageAttendees,
        canAddAttendees: canManageAttendees && event.status === 'published' && !ended,
        canEdit: writes,
        canCancel: writes,
        canDelete: actor.permissions.has('events:delete', id),
      },
    };
  }

  async getEvent(eventId: string, actor: Actor): Promise<MemberEvent> {
    const seen = await this.requireEvent(eventId, actor);
    const now = this.now();
    const [[summary], files] = await Promise.all([
      this.eventSummaries([seen], actor, now),
      seen.sight === 'public'
        ? Promise.resolve({} as Record<string, EventFile[]>)
        : this.content.eventFilesFor([eventId], this.system(actor)),
    ]);
    return { ...summary!, description: seen.event.description, files: files[eventId] ?? [] };
  }

  async listEvents(query: MemberEventsQuery, actor: Actor): Promise<Page<MemberEventSummary>> {
    const now = this.now();
    const reads = actor.permissions.where('events:read');
    const page = await this.repo.events(
      actor.orgId,
      query,
      { orgUserId: actor.id, readAll: reads.org, readIds: reads.content },
      now,
    );
    const rows = await this.eventSummaries(await this.seeEvents(page.rows, actor), actor, now);
    return { ...page, rows };
  }

  async eventCalendar(eventId: string, actor: Actor): Promise<string> {
    const { event, sight } = await this.requireEvent(eventId, actor);
    return eventCalendar(event, {
      pageUrl: `${this.studentPortalUrl}/events/${encodeURIComponent(event.id)}`,
      withLocation: sight !== 'public',
      now: this.now(),
    });
  }

  async eventAttendees(
    eventId: string,
    query: { page: number; pageSize: number },
    actor: Actor,
  ): Promise<Page<EventAttendee>> {
    actor.permissions.require('events:read', eventId);
    if (!(await this.content.findEvent(eventId, this.system(actor)))) {
      throw new NotFoundError('Event', eventId);
    }
    const page = await this.repo.eventAttendees(actor.orgId, eventId, query);
    return {
      ...page,
      rows: page.rows.map((row) => attendeeView(actor.orgId, row, this.fileUrls)),
    };
  }

  async directory(
    communityId: string,
    query: DirectoryQuery,
    actor: Actor,
  ): Promise<Page<DirectoryEntry>> {
    if (!(await this.access.isCommunityMember(communityId, actor))) {
      throw new NotFoundError('Community', communityId);
    }
    const orgId = actor.orgId;
    const community = await this.content.findCommunity(communityId, this.system(actor));
    if (!community) {
      throw new NotFoundError('Community', communityId);
    }
    const readers = await this.people.holders(orgId, 'communities:read', communityId);
    const page = await this.repo.directory(orgId, communityId, query, readers);
    const permissions = await this.people.permissionsOfMany(
      orgId,
      page.rows.map((row) => row.orgUserId),
    );
    return {
      ...page,
      rows: page.rows.map((row) => {
        const held = permissions.get(row.orgUserId);
        const item = held?.roleOn(communityId);
        const org = held?.roleOn();
        return {
          ...row,
          imageUrl: row.imageAssetId
            ? this.fileUrls.publicImage(orgId, row.orgUserId, row.imageAssetId)
            : null,
          team: (item?.team ?? false) || (org?.team ?? false),
          roleName: item?.team ? item.name : org?.team ? org.name : null,
          opensEverySpace:
            (held?.has('communities:read', communityId) ||
              held?.has('communities:moderate', communityId)) ??
            false,
        };
      }),
    };
  }

  async communityHome(communityId: string, actor: Actor): Promise<CommunityHome> {
    if (!(await this.access.isCommunityMember(communityId, actor))) {
      throw new NotFoundError('Community', communityId);
    }
    const system = this.system(actor);
    const community = await this.content.findCommunity(communityId, system);
    if (!community) {
      throw new NotFoundError('Community', communityId);
    }
    const [spaces, everySpace] = await Promise.all([
      this.content.listSpaces(communityId, system),
      this.access.opensEverySpace(actor, communityId),
    ]);
    const itemRole = actor.permissions.roleOn(communityId);
    const orgRole = actor.permissions.roleOn();
    const role = itemRole.team || !orgRole.team ? itemRole : orgRole;
    return {
      communityId,
      title: community.title,
      description: community.description,
      thumbnailUrl: showsImages(community.status, communityId, actor)
        ? community.thumbnailUrl
        : null,
      dm: community.settings.dm,
      spaces: await this.homeSpaces(
        actor,
        communityId,
        spaces,
        everySpace,
        showsImages(community.status, communityId, actor),
      ),
      viewer: {
        permissions: PERMISSION_KEYS.filter((p) => actor.permissions.has(p, communityId)),
        opensEverySpace: everySpace,
        team: itemRole.team || orgRole.team,
        roleName: role.name,
        canCreateEvents: actor.permissions.has('events:write'),
      },
    };
  }

  async communitySpace(
    communityId: string,
    spaceId: string,
    actor: Actor,
  ): Promise<CommunityHomeSpace> {
    if (!(await this.access.isCommunityMember(communityId, actor))) {
      throw new NotFoundError('Space', spaceId);
    }
    const system = this.system(actor);
    const [space, community] = await Promise.all([
      this.content.getSpace(spaceId, system),
      this.content.findCommunity(communityId, system),
    ]);
    if (!space || space.communityId !== communityId || !community) {
      throw new NotFoundError('Space', spaceId);
    }
    const everySpace = await this.access.opensEverySpace(actor, communityId);
    const [view] = await this.homeSpaces(
      actor,
      communityId,
      [space],
      everySpace,
      showsImages(community.status, communityId, actor),
    );
    if (!view) {
      throw new NotFoundError('Space', spaceId);
    }
    return view;
  }

  private async homeSpaces(
    actor: Actor,
    communityId: string,
    spaces: SpaceView[],
    everySpace: boolean,
    images: boolean,
  ): Promise<CommunityHomeSpace[]> {
    const orgId = actor.orgId;
    const excluding = await this.access.everySpaceOpeners(orgId, communityId);
    const [openIds, counts, standings, subscribed] = await Promise.all([
      this.access.openSpaceIds(communityId, actor),
      this.repo.spaceMemberCounts(orgId, communityId, excluding),
      this.access.spaceStandings(communityId, actor),
      this.subscriptions.viewerSubscriptions(
        orgId,
        actor.id,
        'space',
        spaces.map((space) => space.id),
        new Date(),
      ),
    ]);
    const open = new Set(openIds);
    const seen = spaces.filter((space) =>
      seesSpace(everySpace, space.accessRule, standings[space.id]),
    );
    return Promise.all(
      seen.map(async (space): Promise<CommunityHomeSpace> => {
        const memberCount = counts[space.id] ?? 0;
        const base = {
          id: space.id,
          name: space.name,
          memberCount,
          accessRule: space.accessRule,
          standing: standingOf(space, open.has(space.id), memberCount, standings[space.id]),
          coverUrl: images ? space.coverUrl : null,
          backgroundUrl: images ? space.backgroundUrl : null,
          iconUrl: images ? space.iconUrl : null,
        };
        if (!open.has(space.id)) {
          return { ...base, locked: true };
        }
        return {
          ...base,
          locked: false,
          description: space.description,
          capacity: space.capacity,
          settings: space.settings,
          topics: space.topics.map((topic) => ({ id: topic.id, name: topic.name })),
          links: await this.linkViews(actor, space.links),
          subscription: subscribed[space.id] ?? null,
        };
      }),
    );
  }

  private async linkViews(actor: Actor, links: SpaceDetail['links']): Promise<CommunityHomeLink[]> {
    const system = this.system(actor);
    const shown = (type: keyof typeof READ_OF, id: string, status: string) =>
      status === 'published' || actor.permissions.has(READ_OF[type], id);
    const views = await Promise.all(
      links.map(async (link): Promise<CommunityHomeLink | null> => {
        const course = await this.content.findCourse(link.contentId, system);
        if (course) {
          return shown('course', link.contentId, course.status)
            ? { id: link.id, contentId: link.contentId, type: 'course', title: course.title }
            : null;
        }
        const download = await this.content.findDownload(link.contentId, system);
        if (download) {
          return shown('download', link.contentId, download.status)
            ? { id: link.id, contentId: link.contentId, type: 'download', title: download.title }
            : null;
        }
        const community = await this.content.findCommunity(link.contentId, system);
        if (community) {
          return shown('community', link.contentId, community.status)
            ? { id: link.id, contentId: link.contentId, type: 'community', title: community.title }
            : null;
        }
        return null;
      }),
    );
    return views.filter((view): view is CommunityHomeLink => view !== null);
  }
}

function showsImages(status: string, communityId: string, actor: Actor): boolean {
  return status === 'published' || actor.permissions.has('communities:read', communityId);
}

function standingOf(
  space: SpaceDetail,
  open: boolean,
  memberCount: number,
  status: SpaceMember['status'] | undefined,
): CommunityHomeSpace['standing'] {
  if (space.accessRule === 'all_members' || (open && status !== 'active')) {
    return 'open';
  }
  if (status === 'active') {
    return 'member';
  }
  if (status === 'requested' || status === 'invited') {
    return status;
  }
  if (space.capacity !== null && memberCount >= space.capacity) {
    return 'full';
  }
  return 'none';
}
