import { type ContentServicePort, type SpaceDetail } from '../../content/index.js';
import type { EntitlementsService, SpaceMember } from '../../entitlements/index.js';
import type { ProgressService } from '../../progress/index.js';
import type { AssetFiles, FileUrls } from '../../assets/index.js';
import { isStaffRole } from '../../organizations/index.js';
import type { ChatService, PostService } from '../../discussion/index.js';
import type { Notification, NotificationInbox } from '../../identity/index.js';
import type { Actor } from '../../shared/actor.js';
import type {
  ActivityView,
  CommunityHome,
  CommunityHomeLink,
  CommunityHomeSpace,
  CourseProgressView,
  CourseView,
  DirectoryEntry,
  DownloadFile,
  DownloadView,
  Module,
  NotificationView,
  NotificationsView,
} from './model.js';
import type { MemberReportRepository, MemberReportService } from './ports.js';

function ref(
  id: string | null,
  names: ReadonlyMap<string, string>,
): { id: string; name: string } | null {
  const name = id ? names.get(id) : undefined;
  return id && name !== undefined ? { id, name } : null;
}

function isActivityPublished(settings: unknown): boolean {
  return (settings as { published?: boolean } | null)?.published !== false;
}

type MemberAccess = Pick<
  EntitlementsService,
  'isCommunityMember' | 'openSpaceIds' | 'spaceStandings' | 'hasAccess' | 'listAccessibleContent'
>;

export type MemberReportServiceParams = {
  repo: MemberReportRepository;
  content: ContentServicePort;
  progress: ProgressService;
  files: Pick<AssetFiles, 'signFile'>;
  fileUrls: FileUrls;
  access: MemberAccess;
  notifications: Pick<NotificationInbox, 'listNotifications'>;
  posts: Pick<PostService, 'visibleTitles'>;
  chats: Pick<ChatService, 'titlesFor'>;
};

export class MemberReportServiceImpl implements MemberReportService {
  private readonly repo: MemberReportRepository;
  private readonly content: ContentServicePort;
  private readonly progress: ProgressService;
  private readonly files: Pick<AssetFiles, 'signFile'>;
  private readonly fileUrls: FileUrls;
  private readonly access: MemberAccess;
  private readonly inbox: Pick<NotificationInbox, 'listNotifications'>;
  private readonly posts: Pick<PostService, 'visibleTitles'>;
  private readonly chats: Pick<ChatService, 'titlesFor'>;

  constructor(params: MemberReportServiceParams) {
    this.repo = params.repo;
    this.content = params.content;
    this.progress = params.progress;
    this.files = params.files;
    this.fileUrls = params.fileUrls;
    this.access = params.access;
    this.inbox = params.notifications;
    this.posts = params.posts;
    this.chats = params.chats;
  }

  async notifications(
    orgId: string,
    actor: Actor,
    userId: string,
    query: { page: number; pageSize: number },
  ): Promise<NotificationsView> {
    const page = await this.inbox.listNotifications(orgId, userId, query);
    return {
      rows: await this.describeNotifications(orgId, actor, page.rows),
      total: page.total,
      page: page.page,
      pageSize: page.pageSize,
      unreadCount: page.unreadCount,
    };
  }

  async notificationView(
    orgId: string,
    actor: Actor,
    notification: Notification,
  ): Promise<NotificationView> {
    const [view] = await this.describeNotifications(orgId, actor, [notification]);
    return view!;
  }

  private async describeNotifications(
    orgId: string,
    actor: Actor,
    rows: Notification[],
  ): Promise<NotificationView[]> {
    const ids = (pick: (row: Notification) => string | null): string[] => [
      ...new Set(rows.flatMap((row) => pick(row) ?? [])),
    ];
    const [people, postTitles, chatTitles, spaces, communities] = await Promise.all([
      this.repo.people(
        orgId,
        ids((row) => row.actorOrgUserId),
      ),
      this.posts.visibleTitles(
        orgId,
        actor,
        ids((row) => row.postId),
      ),
      this.chats.titlesFor(
        orgId,
        actor,
        ids((row) => row.chatId),
      ),
      Promise.all(ids((row) => row.spaceId).map((id) => this.content.getSpace(orgId, id))),
      Promise.all(ids((row) => row.communityId).map((id) => this.content.getCommunity(orgId, id))),
    ]);
    const personById = new Map(people.map((person) => [person.orgUserId, person]));
    const spaceById = new Map(spaces.flatMap((space) => (space ? [[space.id, space.name]] : [])));
    const communityById = new Map(
      communities.flatMap((community) => (community ? [[community.id, community.title]] : [])),
    );
    const postById = new Map(Object.entries(postTitles));
    const chatById = new Map(Object.entries(chatTitles));
    return rows.map((row) => {
      const person = row.actorOrgUserId ? personById.get(row.actorOrgUserId) : undefined;
      const community = ref(row.communityId, communityById);
      const space = ref(row.spaceId, spaceById);
      const post = ref(row.postId, postById);
      const chat = ref(row.chatId, chatById);
      return {
        id: row.id,
        kind: row.kind,
        createdAt: row.createdAt,
        readAt: row.readAt,
        actor: person
          ? {
              orgUserId: person.orgUserId,
              displayName: person.displayName,
              imageUrl: person.imageAssetId ? this.fileUrls.personImage(person.orgUserId) : null,
            }
          : null,
        community: community && { id: community.id, title: community.name },
        space: space && { id: space.id, name: space.name },
        post: post && { id: post.id, title: post.name },
        commentId: row.commentId,
        chat: chat && { id: chat.id, title: chat.name },
        messageId: row.messageId,
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
  ): Promise<DirectoryEntry[] | null> {
    if (!(await this.access.isCommunityMember(orgId, actor, communityId))) {
      return null;
    }
    const community = await this.content.getCommunity(orgId, communityId);
    if (!community) {
      return null;
    }
    const rows = await this.repo.directory(orgId, communityId);
    return rows.map((row) => ({
      ...row,
      imageUrl: row.imageAssetId ? this.fileUrls.personImage(row.orgUserId) : null,
    }));
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
    const [openIds, counts, standings] = await Promise.all([
      this.access.openSpaceIds(orgId, actor, communityId),
      this.repo.spaceMemberCounts(orgId, communityId),
      this.access.spaceStandings(orgId, actor, communityId),
    ]);
    const open = new Set(openIds);
    return Promise.all(
      spaces.map(async (space) => {
        const memberCount = counts[space.id] ?? 0;
        return {
          id: space.id,
          name: space.name,
          description: space.description,
          memberCount,
          capacity: space.capacity,
          open: open.has(space.id),
          accessRule: space.accessRule,
          standing: standingOf(space, open.has(space.id), memberCount, standings[space.id]),
          settings: space.settings,
          topics: space.topics.map((topic) => ({ id: topic.id, name: topic.name })),
          links: await this.linkViews(orgId, space.links),
        };
      }),
    );
  }

  private async linkViews(
    orgId: string,
    links: SpaceDetail['links'],
  ): Promise<CommunityHomeLink[]> {
    const views = await Promise.all(
      links.map(async (link): Promise<CommunityHomeLink | null> => {
        const course = await this.content.getCourse(orgId, link.contentId);
        if (course) {
          return { id: link.id, contentId: link.contentId, type: 'course', title: course.title };
        }
        const download = await this.content.getDownload(orgId, link.contentId);
        if (download) {
          return {
            id: link.id,
            contentId: link.contentId,
            type: 'download',
            title: download.title,
          };
        }
        const community = await this.content.getCommunity(orgId, link.contentId);
        if (community) {
          return {
            id: link.id,
            contentId: link.contentId,
            type: 'community',
            title: community.title,
          };
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
