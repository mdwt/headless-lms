// reporting/learn — read model. Reuses the content domain's Course/Module
// entities (identical wire shape); adds the enrollment reference the service
// resolves against the content service.
export type { Course, Module } from "../../core/content/index.js";

/** An active-enrollment pointer: the org + course a student may consume. */
export interface CourseRef {
  orgId: string;
  courseId: string;
}
