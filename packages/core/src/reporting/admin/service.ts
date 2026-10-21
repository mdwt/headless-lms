import type {
  CommunityAnalytics,
  CourseAnalytics,
  CourseEnrollmentPoint,
  EnrollmentPoint,
  OverviewStats,
  Page,
  Student,
  StudentAnalytics,
  StudentsQuery,
} from './model.js';
import type { AdminReportRepository, AdminReportService } from './ports.js';

export type AdminReportServiceParams = {
  repo: AdminReportRepository;
};

export class AdminReportServiceImpl implements AdminReportService {
  private readonly repo: AdminReportRepository;

  constructor(params: AdminReportServiceParams) {
    this.repo = params.repo;
  }

  overview(orgId: string): Promise<OverviewStats> {
    return this.repo.overview(orgId);
  }

  enrollments(orgId: string, days: number): Promise<EnrollmentPoint[]> {
    return this.repo.enrollments(orgId, days);
  }

  courseAnalytics(orgId: string, courseId: string): Promise<CourseAnalytics | null> {
    return this.repo.courseAnalytics(orgId, courseId);
  }

  courseEnrollments(
    orgId: string,
    courseId: string,
    days: number,
  ): Promise<CourseEnrollmentPoint[] | null> {
    return this.repo.courseEnrollments(orgId, courseId, days);
  }

  listStudents(orgId: string, query: StudentsQuery): Promise<Page<Student>> {
    return this.repo.listStudents(orgId, query);
  }

  getStudent(orgId: string, id: string): Promise<Student | null> {
    return this.repo.getStudent(orgId, id);
  }

  studentAnalytics(orgId: string, id: string): Promise<StudentAnalytics | null> {
    return this.repo.studentAnalytics(orgId, id);
  }

  communityAnalytics(orgId: string, communityId: string): Promise<CommunityAnalytics | null> {
    return this.repo.communityAnalytics(orgId, communityId);
  }
}
