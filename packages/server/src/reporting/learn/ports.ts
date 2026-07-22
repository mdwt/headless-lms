// reporting/learn — ports.
import type { Course, Module, CourseRef } from './model.js';

/**
 * Inbound: the student-scoped read use-cases. Scoped by `(orgId, studentId)` —
 * the portal org resolved at the boundary. `null` ⇒ not enrolled (→ 404).
 */
export interface LearnReportService {
  listCourses(orgId: string, studentId: string): Promise<Course[]>;
  getCourse(orgId: string, studentId: string, courseId: string): Promise<Course | null>;
  listModules(orgId: string, studentId: string, courseId: string): Promise<Module[] | null>;
}

/**
 * Outbound: the student's active, non-expired enrollments in PUBLISHED courses,
 * scoped to the portal org. Implemented by a Drizzle read repo; the service
 * resolves each ref against the content service for the full Course/Module payload.
 */
export interface LearnEnrollmentReader {
  activeRefs(orgId: string, studentId: string): Promise<CourseRef[]>;
  activeRef(orgId: string, studentId: string, courseId: string): Promise<CourseRef | null>;
}
