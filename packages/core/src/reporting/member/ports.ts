import type { AssetReference, DownloadTicket } from '../../assets/index.js';
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
  downloadAssetUrl(
    orgId: string,
    orgUserId: string,
    downloadId: string,
    assetId: string,
  ): Promise<{ url: string; filename: string } | null>;
  directory(orgId: string, actor: Actor, communityId: string): Promise<DirectoryEntry[] | null>;
  communityHome(orgId: string, actor: Actor, communityId: string): Promise<CommunityHome | null>;
  assetUrl(
    orgId: string,
    actor: Actor,
    assetId: string,
    via: AssetReference,
  ): Promise<DownloadTicket | null>;
}

export interface MemberReportRepository {
  activeRefs(orgId: string, orgUserId: string): Promise<ContentRef[]>;
  activeRef(orgId: string, orgUserId: string, courseId: string): Promise<ContentRef | null>;
  activeDownloadRefs(orgId: string, orgUserId: string): Promise<ContentRef[]>;
  activeDownloadRef(
    orgId: string,
    orgUserId: string,
    downloadId: string,
  ): Promise<ContentRef | null>;
  downloadHasAsset(orgId: string, downloadId: string, assetId: string): Promise<boolean>;
  directory(orgId: string, communityId: string): Promise<DirectoryEntry[]>;
  spaceMemberCounts(orgId: string, communityId: string): Promise<Record<string, number>>;
}
