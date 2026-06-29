// courses context — ports.
// Inbound: the use-case interface the service implements.
// Outbound: contracts this context needs (repository, other contexts' capabilities).
import type { Course } from "./model.js";
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
}

// Outbound port (persistence contract the repository fulfils). Org-scoped.
export interface CoursesRepository {
  list(orgId: string, query: ListCoursesQuery): Promise<Page<Course>>;
  findById(orgId: string, id: string): Promise<Course | null>;
  create(orgId: string, input: CreateCourseInput, slug: string, instructorId: string): Promise<Course>;
  update(orgId: string, id: string, patch: UpdateCourseInput): Promise<Course | null>;
  delete(orgId: string, id: string): Promise<boolean>;
}
