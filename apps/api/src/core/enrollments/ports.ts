// enrollments context — ports.
import type {
  Enrollment,
  EnrollmentsQuery,
  GrantEnrollmentInput,
  Page,
} from "./model.js";

export interface EnrollmentsService {
  list(query: EnrollmentsQuery): Promise<Page<Enrollment>>;
  grant(input: GrantEnrollmentInput): Promise<Enrollment>;
  setStatus(id: string, status: "active" | "revoked"): Promise<Enrollment | null>;
}

export interface EnrollmentsRepository {
  list(query: EnrollmentsQuery): Promise<Page<Enrollment>>;
  insert(input: GrantEnrollmentInput): Promise<Enrollment>;
  setStatus(id: string, status: "active" | "revoked"): Promise<Enrollment | null>;
}
