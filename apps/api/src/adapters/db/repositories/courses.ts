// courses — Drizzle repository (implements the core outbound port).
// Placeholder: the `courses` table is still a stub, so the in-memory adapter
// (adapters/inmemory/courses.ts) backs the service for now. Swap the container
// wiring to this once the schema and queries are built out.
import type { CoursesRepository } from "../../../core/courses/ports.js";
import type { Course } from "../../../core/courses/model.js";
import type {
  CreateCourseInput,
  ListCoursesQuery,
  Page,
  UpdateCourseInput,
} from "../../../core/courses/types.js";

export class DrizzleCoursesRepository implements CoursesRepository {
  async list(_query: ListCoursesQuery): Promise<Page<Course>> {
    throw new Error("not implemented");
  }
  async findById(_id: string): Promise<Course | null> {
    throw new Error("not implemented");
  }
  async create(_input: CreateCourseInput, _slug: string): Promise<Course> {
    throw new Error("not implemented");
  }
  async update(_id: string, _patch: UpdateCourseInput): Promise<Course | null> {
    throw new Error("not implemented");
  }
  async delete(_id: string): Promise<boolean> {
    throw new Error("not implemented");
  }
}
