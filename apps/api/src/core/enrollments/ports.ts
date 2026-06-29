// enrollments context — ports.
import type {
  Enrollment,
  EnrollmentsQuery,
  GrantEnrollmentInput,
  Page,
} from "./model.js";

export interface EnrollmentsService {
  list(orgId: string, query: EnrollmentsQuery): Promise<Page<Enrollment>>;
  grant(orgId: string, input: GrantEnrollmentInput): Promise<Enrollment>;
  setStatus(orgId: string, id: string, status: "active" | "revoked"): Promise<Enrollment | null>;
}

export interface EnrollmentsRepository {
  list(orgId: string, query: EnrollmentsQuery): Promise<Page<Enrollment>>;
  insert(orgId: string, input: GrantEnrollmentInput): Promise<Enrollment>;
  setStatus(orgId: string, id: string, status: "active" | "revoked"): Promise<Enrollment | null>;
}
