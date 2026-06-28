// submissions context — ports.
import type {
  GradeSubmissionInput,
  Page,
  Submission,
  SubmissionsQuery,
} from "./model.js";

export interface SubmissionsService {
  list(query: SubmissionsQuery): Promise<Page<Submission>>;
  grade(id: string, input: GradeSubmissionInput): Promise<Submission | null>;
}

export interface SubmissionsRepository {
  list(query: SubmissionsQuery): Promise<Page<Submission>>;
  grade(id: string, input: GradeSubmissionInput): Promise<Submission | null>;
}
