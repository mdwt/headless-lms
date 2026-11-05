// reporting/admin — public surface.
export { AdminReportServiceImpl } from './service.js';
export type { AdminReportServiceParams } from './service.js';
export { adminReportDeclarations } from './declarations.js';
export type { AdminReportService, AdminReportRepository, PermissionsReader } from './ports.js';
export type {
  CommunityAnalytics,
  CommunityMember,
  CommunityMembersQuery,
  CourseActivityEngagement,
  CourseAnalytics,
  CourseEnrollmentPoint,
  EnrollmentPoint,
  OverviewStats,
  Page,
  Student,
  StudentAnalytics,
  StudentCourseProgress,
  StudentItem,
  StudentRow,
  StudentsQuery,
} from './model.js';
