// reporting/courses — ports.
import type { CourseAnalytics, CourseEnrollmentPoint } from './model.js';

export interface CoursesReportService {
  analytics(orgId: string, courseId: string): Promise<CourseAnalytics | null>;
  enrollments(
    orgId: string,
    courseId: string,
    days: number,
  ): Promise<CourseEnrollmentPoint[] | null>;
}

export interface CoursesReportRepository {
  analytics(orgId: string, courseId: string): Promise<CourseAnalytics | null>;
  enrollments(
    orgId: string,
    courseId: string,
    days: number,
  ): Promise<CourseEnrollmentPoint[] | null>;
}
