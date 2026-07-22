import type { Course, Module, SaveActivityInput } from './model.js';
import type { CreateCourseInput, ListCoursesQuery, Page, UpdateCourseInput } from './types.js';
import type { OutboxAppender, UnitOfWork } from '../shared/ports.js';

export interface ContentService {
  list(orgId: string, query: ListCoursesQuery): Promise<Page<Course>>;
  get(orgId: string, id: string): Promise<Course | null>;
  create(orgId: string, input: CreateCourseInput): Promise<Course>;
  /** @throws NotFoundError when no course with this id exists in the org. */
  update(orgId: string, id: string, patch: UpdateCourseInput): Promise<Course>;
  /** @throws NotFoundError when no course with this id exists in the org. */
  remove(orgId: string, id: string): Promise<void>;

  listForCourse(orgId: string, courseId: string): Promise<Module[]>;
  reorderModules(orgId: string, courseId: string, orderedIds: string[]): Promise<Module[]>;
  createModule(orgId: string, courseId: string, title: string): Promise<Module[]>;
  updateModule(orgId: string, courseId: string, moduleId: string, title: string): Promise<Module[]>;
  deleteModule(orgId: string, courseId: string, moduleId: string): Promise<Module[]>;
  reorderActivities(
    orgId: string,
    courseId: string,
    moduleId: string,
    orderedIds: string[],
  ): Promise<Module[]>;
  saveActivity(
    orgId: string,
    courseId: string,
    moduleId: string,
    input: SaveActivityInput,
    activityId?: string,
  ): Promise<Module[]>;
  deleteActivity(
    orgId: string,
    courseId: string,
    moduleId: string,
    activityId: string,
  ): Promise<Module[]>;
}

// TODO
// Combine repository and structure repo into a single port.
export interface ContentRepository {
  list(orgId: string, query: ListCoursesQuery): Promise<Page<Course>>;
  findById(orgId: string, id: string): Promise<Course | null>;
  create(orgId: string, input: CreateCourseInput, slug: string): Promise<Course>;
  update(orgId: string, id: string, patch: UpdateCourseInput): Promise<Course | null>;
  delete(orgId: string, id: string): Promise<boolean>;
}

export interface ContentTxScope {
  courses: ContentRepository;
  outbox: OutboxAppender;
}

export type ContentUnitOfWork = UnitOfWork<ContentTxScope>;

export interface CourseRepository {
  listForCourse(orgId: string, courseId: string): Promise<Module[]>;
  reorderModules(orgId: string, courseId: string, orderedIds: string[]): Promise<Module[]>;
  createModule(orgId: string, courseId: string, title: string): Promise<Module[]>;
  updateModule(orgId: string, courseId: string, moduleId: string, title: string): Promise<Module[]>;
  deleteModule(orgId: string, courseId: string, moduleId: string): Promise<Module[]>;
  reorderActivities(
    orgId: string,
    courseId: string,
    moduleId: string,
    orderedIds: string[],
  ): Promise<Module[]>;
  saveActivity(
    orgId: string,
    courseId: string,
    moduleId: string,
    input: SaveActivityInput,
    activityId?: string,
  ): Promise<Module[]>;
  deleteActivity(
    orgId: string,
    courseId: string,
    moduleId: string,
    activityId: string,
  ): Promise<Module[]>;
}
