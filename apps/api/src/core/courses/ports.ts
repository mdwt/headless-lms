// courses context — ports.
// Inbound: the use-case interface the service implements.
// Outbound: contracts this context needs (repository, other contexts' capabilities).
import type { Course } from "./model.js";
import type { Module, SaveItemInput } from "./modules.js";
import type {
  CreateCourseInput,
  ListCoursesQuery,
  Page,
  UpdateCourseInput,
} from "./types.js";

// Inbound port (use cases the service exposes). All operations are org-scoped:
// the leading `orgId` is the domain `organizations.id` for the active tenant.
export interface CoursesService {
  list(orgId: string, query: ListCoursesQuery): Promise<Page<Course>>;
  get(orgId: string, id: string): Promise<Course | null>;
  create(orgId: string, input: CreateCourseInput, actorStudentId: string): Promise<Course>;
  update(orgId: string, id: string, patch: UpdateCourseInput): Promise<Course | null>;
  remove(orgId: string, id: string): Promise<boolean>;

  // Modules & items — the curriculum structure under a course. Write operations
  // return the course's full module list (matching how the editor re-renders).
  listForCourse(orgId: string, courseId: string): Promise<Module[]>;
  reorderModules(orgId: string, courseId: string, orderedIds: string[]): Promise<Module[]>;
  createModule(orgId: string, courseId: string, title: string): Promise<Module[]>;
  updateModule(orgId: string, courseId: string, moduleId: string, title: string): Promise<Module[]>;
  deleteModule(orgId: string, courseId: string, moduleId: string): Promise<Module[]>;
  reorderItems(
    orgId: string,
    courseId: string,
    moduleId: string,
    orderedIds: string[],
  ): Promise<Module[]>;
  saveItem(
    orgId: string,
    courseId: string,
    moduleId: string,
    input: SaveItemInput,
    itemId?: string,
  ): Promise<Module[]>;
  deleteItem(orgId: string, courseId: string, moduleId: string, itemId: string): Promise<Module[]>;
}

// Outbound port (persistence contract the repository fulfils). Org-scoped.
export interface CoursesRepository {
  list(orgId: string, query: ListCoursesQuery): Promise<Page<Course>>;
  findById(orgId: string, id: string): Promise<Course | null>;
  create(orgId: string, input: CreateCourseInput, slug: string, instructorId: string): Promise<Course>;
  update(orgId: string, id: string, patch: UpdateCourseInput): Promise<Course | null>;
  delete(orgId: string, id: string): Promise<boolean>;
}

// Outbound port for the curriculum structure (modules + items) under a course.
// Org-scoped; every write returns the course's full ordered module list.
export interface ModulesRepository {
  listForCourse(orgId: string, courseId: string): Promise<Module[]>;
  reorderModules(orgId: string, courseId: string, orderedIds: string[]): Promise<Module[]>;
  createModule(orgId: string, courseId: string, title: string): Promise<Module[]>;
  updateModule(orgId: string, courseId: string, moduleId: string, title: string): Promise<Module[]>;
  deleteModule(orgId: string, courseId: string, moduleId: string): Promise<Module[]>;
  reorderItems(
    orgId: string,
    courseId: string,
    moduleId: string,
    orderedIds: string[],
  ): Promise<Module[]>;
  saveItem(
    orgId: string,
    courseId: string,
    moduleId: string,
    input: SaveItemInput,
    itemId?: string,
  ): Promise<Module[]>;
  deleteItem(orgId: string, courseId: string, moduleId: string, itemId: string): Promise<Module[]>;
}
