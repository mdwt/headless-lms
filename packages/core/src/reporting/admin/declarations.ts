import { requires, type Declarations } from '../../shared/declarations.js';
import type { AdminReportService } from './ports.js';

export const adminReportDeclarations = {
  overview: requires('analytics:read'),
  enrollments: requires('analytics:read'),
  courseAnalytics: requires('progress:read'),
  courseEnrollments: requires('progress:read'),
  courseLearners: requires('progress:read'),
  listStudents: requires('people:read'),
  getStudent: requires('people:read'),
  studentAnalytics: requires('people:read'),
  communityAnalytics: requires('communities:read'),
  communityMembers: requires('access:read'),
  eventAttendees: requires('events:read'),
  eventAnalytics: requires('events:read'),
} as const satisfies Declarations<AdminReportService>;
