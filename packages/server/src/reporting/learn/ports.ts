// reporting/learn — ports.
import type { Course, Module, CourseRef } from "./model.js";

/** Inbound: the student-scoped read use-cases. `null` ⇒ not enrolled (→ 404). */
export interface LearnReportService {
  listCourses(studentId: string): Promise<Course[]>;
  getCourse(studentId: string, courseId: string): Promise<Course | null>;
  listModules(studentId: string, courseId: string): Promise<Module[] | null>;
}

/**
 * Outbound: the student's active, non-expired enrollments in PUBLISHED courses.
 * Implemented by a Drizzle read repo; the service resolves each ref against the
 * content service for the full Course/Module payload.
 */
export interface LearnEnrollmentReader {
  activeRefs(studentId: string): Promise<CourseRef[]>;
  activeRef(studentId: string, courseId: string): Promise<CourseRef | null>;
}
