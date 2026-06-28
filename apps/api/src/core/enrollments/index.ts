// enrollments context — public surface.
export { EnrollmentsServiceImpl } from "./service.js";
export type { EnrollmentsService, EnrollmentsRepository } from "./ports.js";
export type {
  Enrollment,
  EnrollmentStatus,
  EnrollmentSource,
  EnrollmentsQuery,
  GrantEnrollmentInput,
  Page,
} from "./model.js";
