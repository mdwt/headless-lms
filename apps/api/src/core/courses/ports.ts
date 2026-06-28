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

// Inbound port (use cases the service exposes).
export interface CoursesService {
  list(query: ListCoursesQuery): Promise<Page<Course>>;
  get(id: string): Promise<Course | null>;
  create(input: CreateCourseInput): Promise<Course>;
  update(id: string, patch: UpdateCourseInput): Promise<Course | null>;
  remove(id: string): Promise<boolean>;
}

// Outbound port (persistence contract the repository fulfils).
export interface CoursesRepository {
  list(query: ListCoursesQuery): Promise<Page<Course>>;
  findById(id: string): Promise<Course | null>;
  create(input: CreateCourseInput, slug: string): Promise<Course>;
  update(id: string, patch: UpdateCourseInput): Promise<Course | null>;
  delete(id: string): Promise<boolean>;
}
