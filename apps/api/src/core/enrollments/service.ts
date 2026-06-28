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

  list(query: EnrollmentsQuery): Promise<Page<Enrollment>> {
    return this.repo.list(query);
  }

  grant(input: GrantEnrollmentInput): Promise<Enrollment> {
    return this.repo.insert(input);
  }

  setStatus(id: string, status: "active" | "revoked"): Promise<Enrollment | null> {
    return this.repo.setStatus(id, status);
  }
}
