// reporting/admin — public surface.
export { AdminReportServiceImpl } from './service.js';
export type { AdminReportServiceParams } from './service.js';
export { adminReportDeclarations } from './declarations.js';
export type {
  AdminReportService,
  AdminReportRepository,
  PermissionsReader,
  SpaceOpenersReader,
} from './ports.js';
export type {
  CommunityAnalytics,
  CommunityMember,
  CommunityMembersQuery,
  CourseActivityEngagement,
  CourseAnalytics,
  CourseEnrollmentPoint,
  CourseLearner,
  CourseLearnersQuery,
  EnrollmentPoint,
  LearnerGrantStatus,
  OverviewStats,
  Page,
  Student,
  StudentAnalytics,
  StudentCourseProgress,
  StudentItem,
  StudentRow,
  StudentsQuery,
} from './model.js';
