// reporting/learn — ports.
import type {
  Activity,
  Course,
  Module,
  CourseProgressView,
  Download,
  DownloadAsset,
} from './model.js';

/**
 * Inbound: the student-scoped read use-cases. Scoped by `(orgId, orgUserId)` —
 * the portal org resolved at the boundary. `null` ⇒ not enrolled (→ 404).
 */
export interface LearnReportService {
  listCourses(orgId: string, orgUserId: string): Promise<Course[]>;
  getCourse(orgId: string, orgUserId: string, courseId: string): Promise<Course | null>;
  listModules(orgId: string, orgUserId: string, courseId: string): Promise<Module[] | null>;
  listActivities(orgId: string, orgUserId: string, courseId: string): Promise<Activity[] | null>;
  courseProgress(
    orgId: string,
    orgUserId: string,
    courseId: string,
  ): Promise<CourseProgressView | null>;
  listDownloads(orgId: string, orgUserId: string): Promise<Download[]>;
  getDownload(
    orgId: string,
    orgUserId: string,
    downloadId: string,
  ): Promise<{ download: Download; assets: DownloadAsset[] } | null>;
  /** Entitlement-gated. Returns null (→ 404) for every failure — never 403,
   *  which would confirm the resource exists to someone not entitled to it. */
  downloadAssetUrl(
    orgId: string,
    orgUserId: string,
    downloadId: string,
    assetId: string,
  ): Promise<{ url: string; filename: string } | null>;
  activityAssetUrl(
    orgId: string,
    orgUserId: string,
    activityId: string,
    assetId: string,
  ): Promise<{ url: string } | null>;
  downloadThumbnailUrl(orgId: string, downloadId: string): Promise<{ url: string } | null>;
}
