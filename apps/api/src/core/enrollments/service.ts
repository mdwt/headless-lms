// enrollments context — service implementation (inbound port).
import type {
  Enrollment,
  EnrollmentsQuery,
  GrantEnrollmentInput,
  Page,
} from "./model.js";
import type { EnrollmentsRepository, EnrollmentsService } from "./ports.js";

export class EnrollmentsServiceImpl implements EnrollmentsService {
  constructor(private readonly repo: EnrollmentsRepository) {}

  list(orgId: string, query: EnrollmentsQuery): Promise<Page<Enrollment>> {
    return this.repo.list(orgId, query);
  }

  grant(orgId: string, input: GrantEnrollmentInput): Promise<Enrollment> {
    return this.repo.insert(orgId, input);
  }

  setStatus(orgId: string, id: string, status: "active" | "revoked"): Promise<Enrollment | null> {
    return this.repo.setStatus(orgId, id, status);
  }
}
