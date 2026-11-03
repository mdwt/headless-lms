import { type ContentServicePort, type SpaceDetail } from '../../content/index.js';
import { seesSpace, type EntitlementsService, type SpaceMember } from '../../entitlements/index.js';
import type { ProgressService } from '../../progress/index.js';
import type { AssetFiles, FileUrls } from '../../assets/index.js';
import { isStaffRole } from '../../organizations/index.js';
import type {
  ItemTitles as DiscussionItemTitles,
  SubscriptionService,
} from '../../discussion/index.js';
import type { ItemTitles as ContentItemTitles } from '../../content/index.js';
import type { NotificationSettingsService } from '../../identity/index.js';
import type { ListedNotification, NotificationsService } from '../../automations/index.js';
import type { ChannelRegistry, NotificationCategoryService } from '../../shared/ports.js';
import { resolveChannels } from '../../shared/notification-settings.js';
import type {
  NotificationCategory,
  NotificationFilter,
  StoredSetting,
  SubjectRef,
} from '../../types/index.js';
import type { Actor } from '../../shared/actor.js';
import type { Page } from '../../types/index.js';
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
>;

export type MemberReportServiceParams = {
  repo: MemberReportRepository;
  content: ContentServicePort;
  progress: ProgressService;
  files: Pick<AssetFiles, 'signFile'>;
  fileUrls: FileUrls;
  access: MemberAccess;
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
  private readonly content: ContentServicePort;
  private readonly progress: ProgressService;
  private readonly files: Pick<AssetFiles, 'signFile'>;
  private readonly fileUrls: FileUrls;
  private readonly access: MemberAccess;
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
    this.notificationList = params.notifications;
    this.titles = params.titles;
    this.subscriptions = params.subscriptions;
    this.notificationCategories = params.notificationCategories;
    this.notificationSettings = params.notificationSettings;
    this.channels = params.channels;
  }

  async communityNotificationSettings(
    orgId: string,
    actor: Actor,
    userId: string,
    communityId: string,
  ): Promise<CommunityNotificationSettingsView | null> {
    if (!(await this.access.isCommunityMember(orgId, actor, communityId))) {
      return null;
    }
    const [list, settings, spaceIds, spaces, community] = await Promise.all([
      this.notificationCategories.community.get(orgId, communityId),
      this.notificationSettings.get(orgId, userId, { communityId }),
      this.access.openSpaceIds(orgId, actor, communityId),
      this.content.listSpaces(orgId, communityId),
      this.content.getCommunity(orgId, communityId),
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
    orgId: string,
    userId: string,
  ): Promise<OrgNotificationSettingsView> {
    const [list, settings] = await Promise.all([
      this.notificationCategories.org.get(orgId, orgId),
      this.notificationSettings.get(orgId, userId, 'org'),
    ]);
    return { categories: this.settingsView(list.categories, settings, []) };
  }

  private settingsView(
    categories: NotificationCategory[],
    settings: StoredSetting[],
    spaces: { spaceId: string; name: string }[],
  ): NotificationSettingsCategoryView[] {
    const configured = this.channels.list();
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
    orgId: string,
    actor: Actor,
    userId: string,
    filter: NotificationFilter,
    page: { page: number; pageSize: number },
  ): Promise<NotificationsView> {
    const listed = await this.notificationList.list(orgId, userId, filter, page);
    return {
      rows: await this.describeNotifications(orgId, actor, listed.items),
      total: listed.total,
      page: page.page,
      pageSize: page.pageSize,
      unreadCount: listed.unreadCount,
    };
  }

  async notification(
    orgId: string,
    actor: Actor,
    userId: string,
    notificationId: string,
  ): Promise<NotificationView | null> {
    const found = await this.notificationList.get(orgId, userId, notificationId);
    if (!found) {
      return null;
    }
    const [view] = await this.describeNotifications(orgId, actor, [found]);
    return view ?? null;
  }

  async notificationUnreadCounts(
    orgId: string,
    actor: Actor,
    userId: string,
  ): Promise<NotificationUnreadCounts> {
    const communityIds = await this.access.openCommunityIds(orgId, actor);
    return this.notificationList.unreadCounts(orgId, userId, communityIds);
  }

  private async describeNotifications(
    orgId: string,
    actor: Actor,
    rows: ListedNotification[],
  ): Promise<NotificationView[]> {
    const refs = rows.flatMap((row) => [
      ...(row.subject ? [row.subject] : []),
      ...(row.parent ? [row.parent] : []),
      ...(row.communityId ? [{ type: 'community' as const, id: row.communityId }] : []),
      ...(row.spaceId ? [{ type: 'space' as const, id: row.spaceId }] : []),
    ]);
    const actorIds = [...new Set(rows.flatMap((row) => row.actorOrgUserId ?? []))];
    const [people, discussionTitles, contentTitles] = await Promise.all([
      this.repo.people(orgId, actorIds),
      this.titles.discussion.titlesFor(orgId, actor, refs),
      this.titles.content.titlesFor(orgId, actor, refs),
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

  async listCourses(orgId: string, orgUserId: string): Promise<CourseView[]> {
    const ids = await this.access.listAccessibleContent(orgId, orgUserId, 'course');
    const courses = await Promise.all(ids.map((id) => this.content.getCourse(orgId, id)));
    return courses.filter((c): c is CourseView => c !== null && c.status === 'published');
  }

  async getCourse(orgId: string, orgUserId: string, courseId: string): Promise<CourseView | null> {
    if (!(await this.access.hasAccess(orgId, orgUserId, courseId))) {
      return null;
    }
    const course = await this.content.getCourse(orgId, courseId);
    return course && course.status === 'published' ? course : null;
  }

  async listModules(orgId: string, orgUserId: string, courseId: string): Promise<Module[] | null> {
    if (!(await this.getCourse(orgId, orgUserId, courseId))) {
      return null;
    }
    return this.content.listCourseModules(orgId, courseId);
  }

  async listActivities(
    orgId: string,
    orgUserId: string,
    courseId: string,
  ): Promise<ActivityView[] | null> {
    if (!(await this.getCourse(orgId, orgUserId, courseId))) {
      return null;
    }
    const activities = await this.content.listCourseActivityViews(orgId, courseId);
    return activities.filter((a) => isActivityPublished(a.settings));
  }

  async courseProgress(
    orgId: string,
    orgUserId: string,
    courseId: string,
  ): Promise<CourseProgressView | null> {
    if (!(await this.getCourse(orgId, orgUserId, courseId))) {
      return null;
    }
    const courseActivities = await this.content.listCourseActivities(orgId, courseId);
    const ids = courseActivities.filter((a) => isActivityPublished(a.settings)).map((a) => a.id);
    const records = await this.progress.listByTargets(orgId, orgUserId, ids);
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
      orgUserId,
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

  async listDownloads(orgId: string, orgUserId: string): Promise<DownloadView[]> {
    const ids = await this.access.listAccessibleContent(orgId, orgUserId, 'download');
    const rows = await Promise.all(ids.map((id) => this.content.getDownload(orgId, id)));
    return rows.filter((d): d is DownloadView => d !== null && d.status === 'published');
  }

  async getDownload(
    orgId: string,
    orgUserId: string,
    downloadId: string,
  ): Promise<{ download: DownloadView; assets: DownloadFile[] } | null> {
    if (!(await this.access.hasAccess(orgId, orgUserId, downloadId))) {
      return null;
    }
    const download = await this.content.getDownload(orgId, downloadId);
    if (!download || download.status !== 'published') {
      return null;
    }
    const assets = await this.content.listDownloadAssets(orgId, downloadId);
    return { download, assets };
  }

  async thumbnailFile(
    orgId: string,
    actor: Actor,
    owner: 'course' | 'download' | 'community',
    id: string,
  ): Promise<string | null> {
    const item =
      owner === 'course'
        ? await this.content.getCourse(orgId, id)
        : owner === 'download'
          ? await this.content.getDownload(orgId, id)
          : await this.content.getCommunity(orgId, id);
    if (!item?.thumbnailAssetId || (item.status !== 'published' && !isStaffRole(actor.role))) {
      return null;
    }
    return this.files.signFile(orgId, item.thumbnailAssetId);
  }

  async activityFile(
    orgId: string,
    actor: Actor,
    activityId: string,
    assetId: string,
  ): Promise<string | null> {
    const activity = await this.content.getActivity(orgId, activityId);
    if (!activity) {
      return null;
    }
    if (!isStaffRole(actor.role)) {
      if (
        !isActivityPublished(activity.settings) ||
        !(await this.getCourse(orgId, actor.id, activity.courseId))
      ) {
        return null;
      }
    }
    const links = await this.content.listCourseActivityAssets(orgId, activity.courseId);
    if (!links.some((link) => link.activityId === activityId && link.assetId === assetId)) {
      return null;
    }
    return this.files.signFile(orgId, assetId);
  }

  async downloadFile(
    orgId: string,
    actor: Actor,
    downloadId: string,
    assetId: string,
  ): Promise<string | null> {
    if (!isStaffRole(actor.role) && !(await this.getDownload(orgId, actor.id, downloadId))) {
      return null;
    }
    const files = await this.content.listDownloadAssets(orgId, downloadId);
    const file = files.find((f) => f.assetId === assetId);
    if (!file) {
      return null;
    }
    return this.files.signFile(orgId, assetId, { saveAs: file.displayName ?? file.filename });
  }

  async personImage(orgId: string, orgUserId: string): Promise<string | null> {
    const [person] = await this.repo.people(orgId, [orgUserId]);
    if (!person?.imageAssetId) {
      return null;
    }
    return this.files.signFile(orgId, person.imageAssetId);
  }

  async directory(
    orgId: string,
    actor: Actor,
    communityId: string,
    query: DirectoryQuery,
  ): Promise<Page<DirectoryEntry> | null> {
    if (!(await this.access.isCommunityMember(orgId, actor, communityId))) {
      return null;
    }
    const community = await this.content.getCommunity(orgId, communityId);
    if (!community) {
      return null;
    }
    const page = await this.repo.directory(orgId, communityId, query);
    return {
      ...page,
      rows: page.rows.map((row) => ({
        ...row,
        imageUrl: row.imageAssetId ? this.fileUrls.personImage(row.orgUserId) : null,
      })),
    };
  }

  async communityHome(
    orgId: string,
    actor: Actor,
    communityId: string,
  ): Promise<CommunityHome | null> {
    if (!(await this.access.isCommunityMember(orgId, actor, communityId))) {
      return null;
    }
    const community = await this.content.getCommunity(orgId, communityId);
    if (!community) {
      return null;
    }
    const spaces = await this.content.listSpaces(orgId, communityId);
    return {
      communityId,
      title: community.title,
      description: community.description,
      thumbnailUrl: community.thumbnailUrl,
      dm: community.settings.dm,
      spaces: await this.homeSpaces(orgId, actor, communityId, spaces),
    };
  }

  async communitySpace(
    orgId: string,
    actor: Actor,
    communityId: string,
    spaceId: string,
  ): Promise<CommunityHomeSpace | null> {
    if (!(await this.access.isCommunityMember(orgId, actor, communityId))) {
      return null;
    }
    const space = await this.content.getSpace(orgId, spaceId);
    if (!space || space.communityId !== communityId) {
      return null;
    }
    const [view] = await this.homeSpaces(orgId, actor, communityId, [space]);
    return view ?? null;
  }

  private async homeSpaces(
    orgId: string,
    actor: Actor,
    communityId: string,
    spaces: SpaceDetail[],
  ): Promise<CommunityHomeSpace[]> {
    const [openIds, counts, standings, subscribed] = await Promise.all([
      this.access.openSpaceIds(orgId, actor, communityId),
      this.repo.spaceMemberCounts(orgId, communityId),
      this.access.spaceStandings(orgId, actor, communityId),
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
      seesSpace(actor.role, space.accessRule, standings[space.id]),
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
          links: await this.linkViews(orgId, actor, space.links),
          subscription: subscribed[space.id] ?? null,
        };
      }),
    );
  }

  private async linkViews(
    orgId: string,
    actor: Actor,
    links: SpaceDetail['links'],
  ): Promise<CommunityHomeLink[]> {
    const shown = (status: string) => status === 'published' || isStaffRole(actor.role);
    const views = await Promise.all(
      links.map(async (link): Promise<CommunityHomeLink | null> => {
        const course = await this.content.getCourse(orgId, link.contentId);
        if (course) {
          return shown(course.status)
            ? { id: link.id, contentId: link.contentId, type: 'course', title: course.title }
            : null;
        }
        const download = await this.content.getDownload(orgId, link.contentId);
        if (download) {
          return shown(download.status)
            ? { id: link.id, contentId: link.contentId, type: 'download', title: download.title }
            : null;
        }
        const community = await this.content.getCommunity(orgId, link.contentId);
        if (community) {
          return shown(community.status)
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
