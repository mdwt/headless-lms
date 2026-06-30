// courses context — DTOs and use-case inputs/outputs. Framework-free.
import type { CourseStatus } from "./model.js";

export type CoursesId = string;

export interface ListCoursesQuery {
  page: number;
  pageSize: number;
  search?: string | undefined;
  /** Sort field, optionally `-` prefixed for descending (e.g. `-updatedAt`). */
  sort?: string | undefined;
  status?: CourseStatus | undefined;
  category?: string | undefined;
}

export interface Page<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreateCourseInput {
  title: string;
  description?: string | undefined;
  category?: string | undefined;
}

export interface UpdateCourseInput {
  title?: string | undefined;
  description?: string | undefined;
  category?: string | undefined;
  status?: CourseStatus | undefined;
}
