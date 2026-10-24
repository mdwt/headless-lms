import type { Actor } from '../../shared/actor.js';
import type {
  ActivityView,
  CommunityHome,
  ContentRef,
  CourseProgressView,
  CourseView,
  DirectoryEntry,
  DirectoryRow,
  DownloadFile,
  DownloadView,
  Module,
} from './model.js';

export interface MemberReportService {
  listCourses(orgId: string, orgUserId: string): Promise<CourseView[]>;
  getCourse(orgId: string, orgUserId: string, courseId: string): Promise<CourseView | null>;
  listModules(orgId: string, orgUserId: string, courseId: string): Promise<Module[] | null>;
  listActivities(
    orgId: string,
    orgUserId: string,
    courseId: string,
  ): Promise<ActivityView[] | null>;
  courseProgress(
    orgId: string,
    orgUserId: string,
    courseId: string,
  ): Promise<CourseProgressView | null>;
  listDownloads(orgId: string, orgUserId: string): Promise<DownloadView[]>;
  getDownload(
    orgId: string,
    orgUserId: string,
    downloadId: string,
  ): Promise<{ download: DownloadView; assets: DownloadFile[] } | null>;
  directory(orgId: string, actor: Actor, communityId: string): Promise<DirectoryEntry[] | null>;
  communityHome(orgId: string, actor: Actor, communityId: string): Promise<CommunityHome | null>;
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
  directory(orgId: string, communityId: string): Promise<DirectoryRow[]>;
  spaceMemberCounts(orgId: string, communityId: string): Promise<Record<string, number>>;
}
