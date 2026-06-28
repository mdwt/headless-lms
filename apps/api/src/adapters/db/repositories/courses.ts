// courses — Drizzle repository (implements the core outbound port). Empty.
import type { CoursesRepository } from "../../../core/courses/ports.js";
import type { CoursesEntity } from "../../../core/courses/model.js";

export class DrizzleCoursesRepository implements CoursesRepository {
  async findById(_id: string): Promise<CoursesEntity | null> {
    throw new Error("not implemented");
  }
}
