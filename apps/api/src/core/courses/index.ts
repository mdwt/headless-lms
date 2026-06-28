// courses context — public surface. Re-export only what other contexts may use.
export { CoursesServiceImpl } from "./service.js";
export type { CoursesService, CoursesRepository } from "./ports.js";
export type { Course, CourseStatus } from "./model.js";
export type {
  CoursesId,
  CreateCourseInput,
  ListCoursesQuery,
  Page,
  UpdateCourseInput,
} from "./types.js";
