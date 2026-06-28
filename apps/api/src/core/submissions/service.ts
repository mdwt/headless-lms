// submissions context — service implementation (inbound port).
import type {
  GradeSubmissionInput,
  Page,
  Submission,
  SubmissionsQuery,
} from "./model.js";
import type { SubmissionsRepository, SubmissionsService } from "./ports.js";

export class SubmissionsServiceImpl implements SubmissionsService {
  constructor(private readonly repo: SubmissionsRepository) {}

  list(query: SubmissionsQuery): Promise<Page<Submission>> {
    return this.repo.list(query);
  }

  grade(id: string, input: GradeSubmissionInput): Promise<Submission | null> {
    return this.repo.grade(id, input);
  }
}
