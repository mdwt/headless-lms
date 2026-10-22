import { type ContentServicePort } from '../../content/index.js';
import type { CommunityAccessReader } from '../../entitlements/index.js';
import type { ProgressService } from '../../progress/index.js';
import type { AssetReference, AssetsService, DownloadTicket } from '../../assets/index.js';
import type { ChatService, PostService } from '../../discussion/index.js';
import type { IdentityService } from '../../identity/index.js';
import type { OrganizationsRepository } from '../../organizations/index.js';
import type { Actor } from '../../shared/actor.js';
import { ForbiddenError, NotFoundError } from '../../shared/errors.js';
import type {
  Activity,
  CommunityHome,
  Course,
  CourseProgressView,
  DirectoryEntry,
  Download,
  DownloadAsset,
  Module,
} from './model.js';
import type { MemberReportRepository, MemberReportService } from './ports.js';
import type { Logger } from '../../shared/ports.js';
import { noopLogger } from '../../shared/logger.js';

function isActivityPublished(settings: unknown): boolean {
  return (settings as { published?: boolean } | null)?.published !== false;
}

export type MemberReportServiceParams = {
  repo: MemberReportRepository;
  content: ContentServicePort;
  progress: ProgressService;
  assets: AssetsService;
  access?: CommunityAccessReader;
  posts?: Pick<PostService, 'getPost'>;
  chats?: Pick<ChatService, 'getMessage'>;
  profiles?: Pick<IdentityService, 'getProfile'>;
  orgUsers?: Pick<OrganizationsRepository, 'findOrgUserById'>;
  deliveryExpirySeconds: number;
  logger?: Logger;
};

export class MemberReportServiceImpl implements MemberReportService {
  private readonly repo: MemberReportRepository;
  private readonly content: ContentServicePort;
  private readonly progress: ProgressService;
  private readonly assets: AssetsService;
  private readonly access: CommunityAccessReader;
  private readonly posts: Pick<PostService, 'getPost'>;
  private readonly chats: Pick<ChatService, 'getMessage'>;
  private readonly profiles: Pick<IdentityService, 'getProfile'>;
  private readonly orgUsers: Pick<OrganizationsRepository, 'findOrgUserById'>;
  private readonly deliveryExpirySeconds: number;
  private readonly logger: Logger;

  constructor(params: MemberReportServiceParams) {
    this.repo = params.repo;
    this.content = params.content;
    this.progress = params.progress;
    this.assets = params.assets;
    this.access = params.access ?? {
      isCommunityMember: async () => false,
      canOpenSpace: async () => false,
      openSpaceIds: async () => [],
      grantOpensCommunity: async () => false,
    };
    this.posts = params.posts ?? {
      getPost: async (_orgId, _actor, postId) => {
        throw new NotFoundError('Post', postId);
      },
    };
    this.chats = params.chats ?? {
      getMessage: async (_orgId, _actor, messageId) => {
        throw new NotFoundError('Message', messageId);
      },
    };
    this.profiles = params.profiles ?? { getProfile: async () => null };
    this.orgUsers = params.orgUsers ?? { findOrgUserById: async () => null };
    this.deliveryExpirySeconds = params.deliveryExpirySeconds;
    this.logger = params.logger ?? noopLogger;
  }

  async listCourses(orgId: string, orgUserId: string): Promise<Course[]> {
    const refs = await this.repo.activeRefs(orgId, orgUserId);
    const courses = await Promise.all(
      refs.map((ref) => this.content.getCourse(ref.orgId, ref.contentId)),
    );
    return courses.filter((c): c is Course => c !== null && c.status === 'published');
  }

  async getCourse(orgId: string, orgUserId: string, courseId: string): Promise<Course | null> {
    const ref = await this.repo.activeRef(orgId, orgUserId, courseId);
    if (!ref) {
      return null;
    }
    const course = await this.content.getCourse(ref.orgId, courseId);
    return course && course.status === 'published' ? course : null;
  }

  async listModules(orgId: string, orgUserId: string, courseId: string): Promise<Module[] | null> {
    const ref = await this.repo.activeRef(orgId, orgUserId, courseId);
    if (!ref) {
      return null;
    }
    return this.content.listCourseModules(ref.orgId, courseId);
  }

  async listActivities(
    orgId: string,
    orgUserId: string,
    courseId: string,
  ): Promise<Activity[] | null> {
    const ref = await this.repo.activeRef(orgId, orgUserId, courseId);
    if (!ref) {
      return null;
    }
    const activities = await this.content.listCourseActivities(ref.orgId, courseId);
    return activities.filter((a) => isActivityPublished(a.settings));
  }

  async courseProgress(
    orgId: string,
    orgUserId: string,
    courseId: string,
  ): Promise<CourseProgressView | null> {
    const ref = await this.repo.activeRef(orgId, orgUserId, courseId);
    if (!ref) {
      return null;
    }
    const courseActivities = await this.content.listCourseActivities(ref.orgId, courseId);
    const ids = courseActivities.filter((a) => isActivityPublished(a.settings)).map((a) => a.id);
    const records = await this.progress.listByTargets(ref.orgId, orgUserId, ids);
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
    const courseRecord = await this.progress.get(ref.orgId, {
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

  async listDownloads(orgId: string, orgUserId: string): Promise<Download[]> {
    const refs = await this.repo.activeDownloadRefs(orgId, orgUserId);
    const rows = await Promise.all(
      refs.map((ref) => this.content.getDownload(ref.orgId, ref.contentId)),
    );
    return rows.filter((d): d is Download => d !== null && d.status === 'published');
  }

  async getDownload(
    orgId: string,
    orgUserId: string,
    downloadId: string,
  ): Promise<{ download: Download; assets: DownloadAsset[] } | null> {
    const ref = await this.repo.activeDownloadRef(orgId, orgUserId, downloadId);
    if (!ref) {
      return null;
    }
    const download = await this.content.getDownload(ref.orgId, downloadId);
    if (!download || download.status !== 'published') {
      return null;
    }
    const assets = await this.content.listDownloadAssets(ref.orgId, downloadId);
    return { download, assets };
  }

  /** The paywall. Two gates, in order: an active entitlement to a published
   *  download, then the asset actually belonging to that download — so a
   *  student entitled to X cannot reach an asset of Y by swapping the id. */
  async downloadAssetUrl(
    orgId: string,
    orgUserId: string,
    downloadId: string,
    assetId: string,
  ): Promise<{ url: string; filename: string } | null> {
    const ref = await this.repo.activeDownloadRef(orgId, orgUserId, downloadId);
    if (!ref) {
      return null;
    }
    const linked = await this.repo.downloadHasAsset(ref.orgId, downloadId, assetId);
    if (!linked) {
      this.logger.warn('download asset not linked', { orgId, downloadId, assetId });
      return null;
    }
    const links = await this.content.listDownloadAssets(ref.orgId, downloadId);
    const link = links.find((l) => l.assetId === assetId);
    if (!link) {
      return null;
    }
    const asset = await this.assets.get(ref.orgId, assetId);
    if (!asset) {
      return null;
    }
    const filename = link.displayName ?? asset.filename;
    const ticket = await this.assets.requestDownload(
      ref.orgId,
      assetId,
      filename,
      this.deliveryExpirySeconds,
    );
    if (!ticket) {
      return null;
    }
    // Never log the signed URL — it is a bearer capability.
    this.logger.info('download asset signed', { orgId, downloadId, assetId });
    return { url: ticket.url, filename };
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
    return this.repo.directory(orgId, communityId);
  }

  async communityHome(orgId: string, actor: Actor, communityId: string): Promise<CommunityHome | null> {
    if (!(await this.access.isCommunityMember(orgId, actor, communityId))) {
      return null;
    }
    const community = await this.content.getCommunity(orgId, communityId);
    if (!community) {
      return null;
    }
    const spaces = await this.content.listSpaces(orgId, communityId);
    const open = new Set(await this.access.openSpaceIds(orgId, actor, communityId));
    const counts = await this.repo.spaceMemberCounts(orgId, communityId);
    return {
      communityId,
      title: community.title,
      spaces: spaces
        .filter((space) => open.has(space.id) || space.accessRule === 'by_request')
        .map((space) => ({
          id: space.id,
          name: space.name,
          memberCount: counts[space.id] ?? 0,
          open: open.has(space.id),
          accessRule: space.accessRule,
        })),
    };
  }

  async assetUrl(
    orgId: string,
    actor: Actor,
    assetId: string,
    via: AssetReference,
  ): Promise<DownloadTicket | null> {
    if (!(await this.references(orgId, actor, assetId, via))) {
      return null;
    }
    const asset = await this.assets.get(orgId, assetId);
    if (!asset || asset.status !== 'ready') {
      return null;
    }
    const ticket = await this.assets.requestDownload(
      orgId,
      assetId,
      asset.filename,
      this.deliveryExpirySeconds,
    );
    if (!ticket) {
      return null;
    }
    this.logger.info('member asset signed', { orgId, assetId, via: Object.keys(via)[0] });
    return ticket;
  }

  private async references(
    orgId: string,
    actor: Actor,
    assetId: string,
    via: AssetReference,
  ): Promise<boolean> {
    if ('activity' in via) {
      const activity = await this.content.getActivity(orgId, via.activity);
      if (!activity || !isActivityPublished(activity.settings)) {
        return false;
      }
      const ref = await this.repo.activeRef(orgId, actor.id, activity.courseId);
      if (!ref) {
        return false;
      }
      const links = await this.content.listCourseActivityAssets(ref.orgId, activity.courseId);
      return links.some((link) => link.activityId === via.activity && link.assetId === assetId);
    }
    if ('course' in via) {
      const course = await this.getCourse(orgId, actor.id, via.course);
      return course !== null && course.thumbnailAssetId === assetId;
    }
    if ('download' in via) {
      const detail = await this.getDownload(orgId, actor.id, via.download);
      return detail !== null && detail.download.thumbnailAssetId === assetId;
    }
    if ('community' in via) {
      if (!(await this.access.isCommunityMember(orgId, actor, via.community))) {
        return false;
      }
      const community = await this.content.getCommunity(orgId, via.community);
      return community !== null && community.thumbnailAssetId === assetId;
    }
    if ('post' in via) {
      const post = await this.readable(() => this.posts.getPost(orgId, actor, via.post));
      return post !== null && post.coverAssetId === assetId;
    }
    if ('message' in via) {
      const read = await this.readable(() => this.chats.getMessage(orgId, actor, via.message));
      return read !== null && read.assetIds.includes(assetId);
    }
    const orgUser = await this.orgUsers.findOrgUserById(orgId, via.profile);
    if (!orgUser) {
      return false;
    }
    const profile = await this.profiles.getProfile(orgUser.userId);
    return (
      profile !== null && profile.imageAssetOrgId === orgId && profile.imageAssetId === assetId
    );
  }

  private async readable<T>(read: () => Promise<T>): Promise<T | null> {
    try {
      return await read();
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof ForbiddenError) {
        return null;
      }
      throw error;
    }
  }
}
