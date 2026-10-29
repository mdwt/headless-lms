// reporting/admin — ports.
import type {
  CommunityAnalytics,
  CommunityMember,
  CommunityMembersQuery,
  CourseAnalytics,
  CourseEnrollmentPoint,
  EnrollmentPoint,
  OverviewStats,
  Page,
  Student,
  StudentAnalytics,
  StudentsQuery,
} from './model.js';

export interface AdminReportService {
  overview(orgId: string): Promise<OverviewStats>;
  enrollments(orgId: string, days: number): Promise<EnrollmentPoint[]>;
  courseAnalytics(orgId: string, courseId: string): Promise<CourseAnalytics | null>;
  courseEnrollments(
    orgId: string,
    courseId: string,
    days: number,
  ): Promise<CourseEnrollmentPoint[] | null>;
  listStudents(orgId: string, query: StudentsQuery): Promise<Page<Student>>;
  getStudent(orgId: string, id: string): Promise<Student | null>;
  studentAnalytics(orgId: string, id: string): Promise<StudentAnalytics | null>;
  communityAnalytics(orgId: string, communityId: string): Promise<CommunityAnalytics | null>;
  communityMembers(
    orgId: string,
    communityId: string,
    query: CommunityMembersQuery,
  ): Promise<Page<CommunityMember> | null>;
}

export interface AdminReportRepository {
  overview(orgId: string): Promise<OverviewStats>;
  enrollments(orgId: string, days: number): Promise<EnrollmentPoint[]>;
  courseAnalytics(orgId: string, courseId: string): Promise<CourseAnalytics | null>;
  courseEnrollments(
    orgId: string,
    courseId: string,
    days: number,
  ): Promise<CourseEnrollmentPoint[] | null>;
  listStudents(orgId: string, query: StudentsQuery): Promise<Page<Student>>;
  getStudent(orgId: string, id: string): Promise<Student | null>;
  studentAnalytics(orgId: string, id: string): Promise<StudentAnalytics | null>;
  communityAnalytics(orgId: string, communityId: string): Promise<CommunityAnalytics | null>;
  communityMembers(
    orgId: string,
    communityId: string,
    query: CommunityMembersQuery,
  ): Promise<Page<CommunityMember> | null>;
}
