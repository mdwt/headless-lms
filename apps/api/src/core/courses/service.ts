// courses context — service implementation (inbound port).
import type { Course } from "./model.js";
import type { CoursesService, CoursesRepository } from "./ports.js";
import type {
  CreateCourseInput,
  ListCoursesQuery,
  Page,
  UpdateCourseInput,
} from "./types.js";

/** URL-safe slug derived from a title. Domain rule owned by the service. */
function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export class CoursesServiceImpl implements CoursesService {
  constructor(private readonly repo: CoursesRepository) {}

  list(orgId: string, query: ListCoursesQuery): Promise<Page<Course>> {
    return this.repo.list(orgId, query);
  }

  get(orgId: string, id: string): Promise<Course | null> {
    return this.repo.findById(orgId, id);
  }

  create(orgId: string, input: CreateCourseInput, actorStudentId: string): Promise<Course> {
    // Default the instructor to the acting member when the input omits one.
    const instructorId = input.instructorId ?? actorStudentId;
    return this.repo.create(orgId, input, slugify(input.title), instructorId);
  }

  update(orgId: string, id: string, patch: UpdateCourseInput): Promise<Course | null> {
    return this.repo.update(orgId, id, patch);
  }

  remove(orgId: string, id: string): Promise<boolean> {
    return this.repo.delete(orgId, id);
  }
}
