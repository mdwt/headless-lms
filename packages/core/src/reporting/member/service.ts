import { type ContentServicePort } from '../../content/index.js';
import type { CommunityAccessReader } from '../../entitlements/index.js';
import type { ProgressService } from '../../progress/index.js';
import type { AssetUrlSigner } from '../../assets/index.js';
import type { Actor } from '../../shared/actor.js';
import type {
  ActivityView,
  CommunityHome,
  CourseProgressView,
  CourseView,
  DirectoryEntry,
  DownloadFile,
  DownloadView,
  Module,
} from './model.js';
import type { MemberReportRepository, MemberReportService } from './ports.js';

function isActivityPublished(settings: unknown): boolean {
  return (settings as { published?: boolean } | null)?.published !== false;
}

export type MemberReportServiceParams = {
  repo: MemberReportRepository;
  content: ContentServicePort;
  progress: ProgressService;
  assetUrls: AssetUrlSigner;
  access: Pick<CommunityAccessReader, 'isCommunityMember' | 'openSpaceIds'>;
};

export class MemberReportServiceImpl implements MemberReportService {
  private readonly repo: MemberReportRepository;
  private readonly content: ContentServicePort;
  private readonly progress: ProgressService;
  private readonly assetUrls: AssetUrlSigner;
  private readonly access: Pick<CommunityAccessReader, 'isCommunityMember' | 'openSpaceIds'>;

  constructor(params: MemberReportServiceParams) {
    this.repo = params.repo;
    this.content = params.content;
    this.progress = params.progress;
    this.assetUrls = params.assetUrls;
    this.access = params.access;
  }

  async listCourses(orgId: string, orgUserId: string): Promise<CourseView[]> {
    const refs = await this.repo.activeRefs(orgId, orgUserId);
    const courses = await Promise.all(
      refs.map((ref) => this.content.getCourse(ref.orgId, ref.contentId)),
    );
    return courses.filter((c): c is CourseView => c !== null && c.status === 'published');
  }

  async getCourse(
    orgId: string,
    orgUserId: string,
    courseId: string,
  ): Promise<CourseView | null> {
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
  ): Promise<ActivityView[] | null> {
    const ref = await this.repo.activeRef(orgId, orgUserId, courseId);
    if (!ref) {
      return null;
    }
    const activities = await this.content.listCourseActivityViews(ref.orgId, courseId);
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

  async listDownloads(orgId: string, orgUserId: string): Promise<DownloadView[]> {
    const refs = await this.repo.activeDownloadRefs(orgId, orgUserId);
    const rows = await Promise.all(
      refs.map((ref) => this.content.getDownload(ref.orgId, ref.contentId)),
    );
    return rows.filter((d): d is DownloadView => d !== null && d.status === 'published');
  }

  async getDownload(
    orgId: string,
    orgUserId: string,
    downloadId: string,
  ): Promise<{ download: DownloadView; assets: DownloadFile[] } | null> {
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
    const urls = await this.assetUrls.urls(
      orgId,
      rows.flatMap((row) => (row.imageAssetId ? [row.imageAssetId] : [])),
    );
    return rows.map((row) => ({
      ...row,
      imageUrl: row.imageAssetId ? (urls[row.imageAssetId] ?? null) : null,
    }));
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
}
