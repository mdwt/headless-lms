// reporting/member — ports.
import type { DownloadTicket } from '../../assets/index.js';
import type { Actor } from '../../shared/actor.js';
import type {
  Activity,
  CommunityHome,
  Course,
  Module,
  ContentRef,
  CourseProgressView,
  DirectoryEntry,
  Download,
  DownloadAsset,
} from './model.js';

/**
 * Inbound: one org user in the member product. Courses, modules, activities,
 * course progress, downloads, and the download paywall. Scoped by
 * `(orgId, orgUserId)`. `null` ⇒ not enrolled (→ 404).
 */
export interface MemberReportService {
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
  directory(orgId: string, actor: Actor, communityId: string): Promise<DirectoryEntry[] | null>;
  communityHome(orgId: string, actor: Actor, communityId: string): Promise<CommunityHome | null>;
  assetUrl(orgId: string, orgUserId: string, assetId: string): Promise<DownloadTicket | null>;
}

/**
 * Outbound: the student's active, non-expired course entitlements in PUBLISHED
 * courses, scoped to the portal org. Implemented by a Drizzle read repo; the
 * service resolves each ref against the content service for the full
 * Course/Module payload.
 */
export interface MemberReportRepository {
  activeRefs(orgId: string, orgUserId: string): Promise<ContentRef[]>;
  activeRef(orgId: string, orgUserId: string, courseId: string): Promise<ContentRef | null>;
  /** Active, non-expired grants to PUBLISHED downloads, scoped to the org. */
  activeDownloadRefs(orgId: string, orgUserId: string): Promise<ContentRef[]>;
  activeDownloadRef(
    orgId: string,
    orgUserId: string,
    downloadId: string,
  ): Promise<ContentRef | null>;
  /** Whether this asset is linked to this download. The paywall's second gate. */
  downloadHasAsset(orgId: string, downloadId: string, assetId: string): Promise<boolean>;
  directory(orgId: string, communityId: string): Promise<DirectoryEntry[]>;
  spaceMemberCounts(orgId: string, communityId: string): Promise<Record<string, number>>;
  assetVisible(orgId: string, orgUserId: string, assetId: string): Promise<boolean>;
}
