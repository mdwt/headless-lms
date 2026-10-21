// reporting/admin — public surface.
export { AdminReportServiceImpl } from './service.js';
export type { AdminReportService, AdminReportRepository } from './ports.js';
export type {
  CommunityAnalytics,
  CourseActivityEngagement,
  CourseAnalytics,
  CourseEnrollmentPoint,
  EnrollmentPoint,
  OverviewStats,
  Page,
  Student,
  StudentAnalytics,
  StudentCourseProgress,
  StudentsQuery,
} from './model.js';
