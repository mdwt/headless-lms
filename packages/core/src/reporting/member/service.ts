import { type ContentServicePort, type SpaceDetail } from '../../content/index.js';
import { seesSpace, type EntitlementsService, type SpaceMember } from '../../entitlements/index.js';
import type { ProgressService } from '../../progress/index.js';
import type { AssetFiles, FileUrls } from '../../assets/index.js';
import type { OrganizationService } from '../../organizations/index.js';
import { PERMISSION_KEYS } from '../../types/schemas/organizations.js';
import type {
  ItemTitles as DiscussionItemTitles,
  SubscriptionService,
} from '../../discussion/index.js';
import type { ItemTitles as ContentItemTitles } from '../../content/index.js';
import type { NotificationSettingsService } from '../../identity/index.js';
import type { ListedNotification, NotificationsService } from '../../automations/index.js';
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
import type { Page, Permission } from '../../types/index.js';
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
  | 'getCourse'
  | 'listCourseModules'
  | 'listCourseActivityViews'
  | 'listCourseActivities'
  | 'listCourseActivityAssets'
  | 'getActivity'
  | 'getDownload'
  | 'listDownloadAssets'
  | 'getCommunity'
  | 'listSpaces'
  | 'getSpace'
>;

type MemberPeople = Pick<OrganizationService, 'systemActor' | 'permissionsOfMany' | 'holders'>;

const READ_OF = {
  course: 'courses:read',
  download: 'downloads:read',
  community: 'communities:read',
} as const satisfies Record<'course' | 'download' | 'community', Permission>;

export type MemberReportServiceParams = {
  repo: MemberReportRepository;
  content: MemberContent;
  progress: Pick<ProgressService, 'get' | 'listByTargets'>;
  files: Pick<AssetFiles, 'signFile'>;
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
};

export class MemberReportServiceImpl implements MemberReportService {
  private readonly repo: MemberReportRepository;
  private readonly content: MemberContent;
  private readonly progress: Pick<ProgressService, 'get' | 'listByTargets'>;
  private readonly files: Pick<AssetFiles, 'signFile'>;
  private readonly fileUrls: FileUrls;
  private readonly access: MemberAccess;
  private readonly people: MemberPeople;
  private readonly notificationList: Pick<NotificationsService, 'list' | 'get' | 'unreadCounts'>;
  private readonly titles: MemberReportServiceParams['titles'];
  private readonly subscriptions: Pick<SubscriptionService, 'viewerSubscriptions'>;
  private readonly notificationCategories: MemberReportServiceParams['notificationCategories'];
  private readonly notificationSettings: Pick<NotificationSettingsService, 'get'>;
  private readonly channels: Pick<ChannelRegistry, 'list'>;

  constructor(params: MemberReportServiceParams) {
    this.repo = params.repo;
    this.content = params.content;
    this.progress = params.progress;
    this.files = params.files;
    this.fileUrls = params.fileUrls;
    this.access = params.access;
    this.people = params.people;
    this.notificationList = params.notifications;
    this.titles = params.titles;
    this.subscriptions = params.subscriptions;
    this.notificationCategories = params.notificationCategories;
    this.notificationSettings = params.notificationSettings;
    this.channels = params.channels;
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
    userId: string,
    communityId: string,
    actor: Actor,
  ): Promise<CommunityNotificationSettingsView | null> {
    if (!(await this.access.isCommunityMember(communityId, actor))) {
      return null;
    }
    const orgId = actor.orgId;
    const system = this.system(actor);
    const [list, settings, spaceIds, spaces, community] = await Promise.all([
      this.notificationCategories.community.get(communityId, system),
      this.notificationSettings.get(orgId, userId, { communityId }),
      this.access.openSpaceIds(communityId, actor),
      this.content.listSpaces(communityId, system),
      this.content.getCommunity(communityId, system),
    ]);
    const open = new Set(spaceIds);
    return {
      communityId,
      digest: community?.settings.digest ?? null,
      categories: this.settingsView(
        list.categories,
        settings,
        spaces
          .filter((space) => open.has(space.id))
          .map((space) => ({ spaceId: space.id, name: space.name })),
      ),
    };
  }

  async orgNotificationSettings(
    userId: string,
    actor: Actor,
  ): Promise<OrgNotificationSettingsView> {
    const orgId = actor.orgId;
    const [list, settings] = await Promise.all([
      this.notificationCategories.org.get(orgId, this.system(actor)),
      this.notificationSettings.get(orgId, userId, 'org'),
    ]);
    return { categories: this.settingsView(list.categories, settings, []) };
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
    userId: string,
    filter: NotificationFilter,
    page: { page: number; pageSize: number },
    actor: Actor,
  ): Promise<NotificationsView> {
    const listed = await this.notificationList.list(userId, filter, page, actor);
    return {
      rows: await this.describeNotifications(actor, listed.items),
      total: listed.total,
      page: page.page,
      pageSize: page.pageSize,
      unreadCount: listed.unreadCount,
    };
  }

  async notification(
    userId: string,
    notificationId: string,
    actor: Actor,
  ): Promise<NotificationView | null> {
    const found = await this.notificationList.get(userId, notificationId, actor);
    if (!found) {
      return null;
    }
    const [view] = await this.describeNotifications(actor, [found]);
    return view ?? null;
  }

  async notificationUnreadCounts(userId: string, actor: Actor): Promise<NotificationUnreadCounts> {
    const communityIds = await this.access.openCommunityIds(actor);
    return this.notificationList.unreadCounts(userId, communityIds, actor);
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
    const actorIds = [...new Set(rows.flatMap((row) => row.actorOrgUserId ?? []))];
    const [people, discussionTitles, contentTitles] = await Promise.all([
      this.repo.people(orgId, actorIds),
      this.titles.discussion.titlesFor(refs, actor),
      this.titles.content.titlesFor(refs, actor),
    ]);
    const titles = { ...contentTitles, ...discussionTitles };
    const personById = new Map(people.map((person) => [person.orgUserId, person]));
    return rows.map((row) => {
      const person = row.actorOrgUserId ? personById.get(row.actorOrgUserId) : undefined;
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
              imageUrl: person.imageAssetId ? this.fileUrls.personImage(person.orgUserId) : null,
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
    const course = await this.content.getCourse(courseId, this.system(actor));
    return course && (reads || course.status === 'published') ? course : null;
  }

  private async opensDownload(downloadId: string, actor: Actor): Promise<DownloadView | null> {
    const reads = actor.permissions.has('downloads:read', downloadId);
    if (!reads && !(await this.access.hasAccess(actor.orgId, actor.id, downloadId))) {
      return null;
    }
    const download = await this.content.getDownload(downloadId, this.system(actor));
    return download && (reads || download.status === 'published') ? download : null;
  }

  async listCourses(actor: Actor): Promise<CourseView[]> {
    const ids = await this.access.listAccessibleContent(actor.orgId, actor.id, 'course');
    const system = this.system(actor);
    const courses = await Promise.all(ids.map((id) => this.content.getCourse(id, system)));
    return courses.filter((c): c is CourseView => c !== null && c.status === 'published');
  }

  getCourse(courseId: string, actor: Actor): Promise<CourseView | null> {
    return this.opensCourse(courseId, actor);
  }

  async listModules(courseId: string, actor: Actor): Promise<Module[] | null> {
    if (!(await this.opensCourse(courseId, actor))) {
      return null;
    }
    return this.content.listCourseModules(courseId, this.system(actor));
  }

  async listActivities(courseId: string, actor: Actor): Promise<ActivityView[] | null> {
    if (!(await this.opensCourse(courseId, actor))) {
      return null;
    }
    const activities = await this.content.listCourseActivityViews(courseId, this.system(actor));
    return activities.filter((a) => isActivityPublished(a.settings));
  }

  async courseProgress(courseId: string, actor: Actor): Promise<CourseProgressView | null> {
    if (!(await this.opensCourse(courseId, actor))) {
      return null;
    }
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
    const rows = await Promise.all(ids.map((id) => this.content.getDownload(id, system)));
    return rows.filter((d): d is DownloadView => d !== null && d.status === 'published');
  }

  async getDownload(
    downloadId: string,
    actor: Actor,
  ): Promise<{ download: DownloadView; assets: DownloadFile[] } | null> {
    const download = await this.opensDownload(downloadId, actor);
    if (!download) {
      return null;
    }
    const assets = await this.content.listDownloadAssets(downloadId, this.system(actor));
    return { download, assets };
  }

  async thumbnailFile(
    owner: 'course' | 'download' | 'community',
    id: string,
    actor: Actor,
  ): Promise<string | null> {
    const system = this.system(actor);
    const item =
      owner === 'course'
        ? await this.content.getCourse(id, system)
        : owner === 'download'
          ? await this.content.getDownload(id, system)
          : await this.content.getCommunity(id, system);
    if (
      !item?.thumbnailAssetId ||
      (item.status !== 'published' && !actor.permissions.has(READ_OF[owner], id))
    ) {
      return null;
    }
    return this.files.signFile(actor.orgId, item.thumbnailAssetId);
  }

  async activityFile(activityId: string, assetId: string, actor: Actor): Promise<string | null> {
    const system = this.system(actor);
    const activity = await this.content.getActivity(activityId, system);
    if (!activity) {
      return null;
    }
    if (!actor.permissions.has('courses:read', activity.courseId)) {
      if (
        !isActivityPublished(activity.settings) ||
        !(await this.opensCourse(activity.courseId, actor))
      ) {
        return null;
      }
    }
    const links = await this.content.listCourseActivityAssets(activity.courseId, system);
    if (!links.some((link) => link.activityId === activityId && link.assetId === assetId)) {
      return null;
    }
    return this.files.signFile(actor.orgId, assetId);
  }

  async downloadFile(downloadId: string, assetId: string, actor: Actor): Promise<string | null> {
    if (!(await this.opensDownload(downloadId, actor))) {
      return null;
    }
    const files = await this.content.listDownloadAssets(downloadId, this.system(actor));
    const file = files.find((f) => f.assetId === assetId);
    if (!file) {
      return null;
    }
    return this.files.signFile(actor.orgId, assetId, {
      saveAs: file.displayName ?? file.filename,
    });
  }

  async personImage(orgUserId: string, actor: Actor): Promise<string | null> {
    const [person] = await this.repo.people(actor.orgId, [orgUserId]);
    if (!person?.imageAssetId) {
      return null;
    }
    return this.files.signFile(actor.orgId, person.imageAssetId);
  }

  async directory(
    communityId: string,
    query: DirectoryQuery,
    actor: Actor,
  ): Promise<Page<DirectoryEntry> | null> {
    if (!(await this.access.isCommunityMember(communityId, actor))) {
      return null;
    }
    const orgId = actor.orgId;
    const community = await this.content.getCommunity(communityId, this.system(actor));
    if (!community) {
      return null;
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
        const role = held?.roleOn(communityId);
        return {
          ...row,
          imageUrl: row.imageAssetId ? this.fileUrls.personImage(row.orgUserId) : null,
          team: role?.team ?? false,
          roleName: role?.team ? role.name : null,
          opensEverySpace:
            (held?.has('communities:read', communityId) ||
              held?.has('communities:moderate', communityId)) ??
            false,
        };
      }),
    };
  }

  async communityHome(communityId: string, actor: Actor): Promise<CommunityHome | null> {
    if (!(await this.access.isCommunityMember(communityId, actor))) {
      return null;
    }
    const system = this.system(actor);
    const community = await this.content.getCommunity(communityId, system);
    if (!community) {
      return null;
    }
    const [spaces, everySpace] = await Promise.all([
      this.content.listSpaces(communityId, system),
      this.access.opensEverySpace(actor, communityId),
    ]);
    const role = actor.permissions.roleOn(communityId);
    return {
      communityId,
      title: community.title,
      description: community.description,
      thumbnailUrl: community.thumbnailUrl,
      dm: community.settings.dm,
      spaces: await this.homeSpaces(actor, communityId, spaces, everySpace),
      viewer: {
        permissions: PERMISSION_KEYS.filter((p) => actor.permissions.has(p, communityId)),
        opensEverySpace: everySpace,
        team: role.team,
        roleName: role.name,
      },
    };
  }

  async communitySpace(
    communityId: string,
    spaceId: string,
    actor: Actor,
  ): Promise<CommunityHomeSpace | null> {
    if (!(await this.access.isCommunityMember(communityId, actor))) {
      return null;
    }
    const space = await this.content.getSpace(spaceId, this.system(actor));
    if (!space || space.communityId !== communityId) {
      return null;
    }
    const everySpace = await this.access.opensEverySpace(actor, communityId);
    const [view] = await this.homeSpaces(actor, communityId, [space], everySpace);
    return view ?? null;
  }

  private async homeSpaces(
    actor: Actor,
    communityId: string,
    spaces: SpaceDetail[],
    everySpace: boolean,
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
        const course = await this.content.getCourse(link.contentId, system);
        if (course) {
          return shown('course', link.contentId, course.status)
            ? { id: link.id, contentId: link.contentId, type: 'course', title: course.title }
            : null;
        }
        const download = await this.content.getDownload(link.contentId, system);
        if (download) {
          return shown('download', link.contentId, download.status)
            ? { id: link.id, contentId: link.contentId, type: 'download', title: download.title }
            : null;
        }
        const community = await this.content.getCommunity(link.contentId, system);
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
