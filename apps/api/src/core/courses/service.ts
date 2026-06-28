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

  list(query: ListCoursesQuery): Promise<Page<Course>> {
    return this.repo.list(query);
  }

  get(id: string): Promise<Course | null> {
    return this.repo.findById(id);
  }

  create(input: CreateCourseInput): Promise<Course> {
    return this.repo.create(input, slugify(input.title));
  }

  update(id: string, patch: UpdateCourseInput): Promise<Course | null> {
    return this.repo.update(id, patch);
  }

  remove(id: string): Promise<boolean> {
    return this.repo.delete(id);
  }
}
