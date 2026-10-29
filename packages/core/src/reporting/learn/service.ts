import { type ContentServicePort } from '../../content/index.js';
import type { EntitlementsService } from '../../entitlements/index.js';
import type { ProgressService } from '../../progress/index.js';
import type { AssetsService } from '../../assets/index.js';
import type {
  Activity,
  Course,
  CourseProgressView,
  Download,
  DownloadAsset,
  Module,
} from './model.js';
import type { LearnReportService } from './ports.js';
import type { Logger } from '../../shared/ports.js';
import { noopLogger } from '../../shared/logger.js';

function isActivityPublished(settings: unknown): boolean {
  return (settings as { published?: boolean } | null)?.published !== false;
}

export type LearnReportServiceParams = {
  access: Pick<EntitlementsService, 'hasAccess' | 'listAccessibleContent'>;
  content: ContentServicePort;
  progress: ProgressService;
  assets: AssetsService;
  deliveryExpirySeconds: number;
  logger?: Logger;
};

export class LearnReportServiceImpl implements LearnReportService {
  private readonly access: Pick<EntitlementsService, 'hasAccess' | 'listAccessibleContent'>;
  private readonly content: ContentServicePort;
  private readonly progress: ProgressService;
  private readonly assets: AssetsService;
  private readonly deliveryExpirySeconds: number;
  private readonly logger: Logger;

  constructor(params: LearnReportServiceParams) {
    this.access = params.access;
    this.content = params.content;
    this.progress = params.progress;
    this.assets = params.assets;
    this.deliveryExpirySeconds = params.deliveryExpirySeconds;
    this.logger = params.logger ?? noopLogger;
  }

  async listCourses(orgId: string, orgUserId: string): Promise<Course[]> {
    const ids = await this.access.listAccessibleContent(orgId, orgUserId, 'course');
    const courses = await Promise.all(ids.map((id) => this.content.getCourse(orgId, id)));
    return courses.filter((c): c is Course => c !== null && c.status === 'published');
  }

  async getCourse(orgId: string, orgUserId: string, courseId: string): Promise<Course | null> {
    if (!(await this.access.hasAccess(orgId, orgUserId, courseId))) {
      return null;
    }
    const course = await this.content.getCourse(orgId, courseId);
    return course && course.status === 'published' ? course : null;
  }

  private async getOpenDownload(
    orgId: string,
    orgUserId: string,
    downloadId: string,
  ): Promise<Download | null> {
    if (!(await this.access.hasAccess(orgId, orgUserId, downloadId))) {
      return null;
    }
    const download = await this.content.getDownload(orgId, downloadId);
    return download && download.status === 'published' ? download : null;
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
  ): Promise<Activity[] | null> {
    if (!(await this.getCourse(orgId, orgUserId, courseId))) {
      return null;
    }
    const activities = await this.content.listCourseActivities(orgId, courseId);
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

  async listDownloads(orgId: string, orgUserId: string): Promise<Download[]> {
    const ids = await this.access.listAccessibleContent(orgId, orgUserId, 'download');
    const rows = await Promise.all(ids.map((id) => this.content.getDownload(orgId, id)));
    return rows.filter((d): d is Download => d !== null && d.status === 'published');
  }

  async getDownload(
    orgId: string,
    orgUserId: string,
    downloadId: string,
  ): Promise<{ download: Download; assets: DownloadAsset[] } | null> {
    const download = await this.getOpenDownload(orgId, orgUserId, downloadId);
    if (!download) {
      return null;
    }
    const assets = await this.content.listDownloadAssets(orgId, downloadId);
    return { download, assets };
  }

  /** The paywall. Two gates, in order: access to a published download, then the asset actually belonging to that download — so a
   *  student entitled to X cannot reach an asset of Y by swapping the id. */
  async downloadAssetUrl(
    orgId: string,
    orgUserId: string,
    downloadId: string,
    assetId: string,
  ): Promise<{ url: string; filename: string } | null> {
    if (!(await this.getOpenDownload(orgId, orgUserId, downloadId))) {
      return null;
    }
    const links = await this.content.listDownloadAssets(orgId, downloadId);
    const link = links.find((l) => l.assetId === assetId);
    if (!link) {
      this.logger.warn('download asset not linked', { orgId, downloadId, assetId });
      return null;
    }
    const asset = await this.assets.get(orgId, assetId);
    if (!asset) {
      return null;
    }
    const filename = link.displayName ?? asset.filename;
    const ticket = await this.assets.requestDownload(
      orgId,
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

  async activityAssetUrl(
    orgId: string,
    orgUserId: string,
    activityId: string,
    assetId: string,
  ): Promise<{ url: string } | null> {
    const activity = await this.content.getActivity(orgId, activityId);
    if (!activity || !isActivityPublished(activity.settings)) {
      return null;
    }
    if (!(await this.getCourse(orgId, orgUserId, activity.courseId))) {
      return null;
    }
    const links = await this.content.listCourseActivityAssets(orgId, activity.courseId);
    if (!links.some((l) => l.activityId === activityId && l.assetId === assetId)) {
      this.logger.warn('activity asset not linked', { orgId, activityId, assetId });
      return null;
    }
    return this.sign(orgId, assetId);
  }

  async downloadThumbnailUrl(orgId: string, downloadId: string): Promise<{ url: string } | null> {
    const download = await this.content.getDownload(orgId, downloadId);
    if (!download || download.status !== 'published' || !download.thumbnailAssetId) {
      return null;
    }
    return this.sign(orgId, download.thumbnailAssetId);
  }

  private async sign(orgId: string, assetId: string): Promise<{ url: string } | null> {
    const ticket = await this.assets.requestDownload(orgId, assetId);
    return ticket ? { url: ticket.url } : null;
  }
}
