// submissions context — domain entities & DTOs. Framework-free.

export type SubmissionStatus = "pending" | "graded" | "returned";

export interface Submission {
  readonly id: string;
  assessmentId: string;
  assessmentTitle: string;
  courseId: string;
  courseTitle: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  status: SubmissionStatus;
  submittedAt: string;
  pointsPossible: number;
  score: number | null;
  feedback: string | null;
  responsePreview: string;
}

export interface SubmissionsQuery {
  page: number;
  pageSize: number;
  search?: string | undefined;
  sort?: string | undefined;
  status?: SubmissionStatus | undefined;
  courseTitle?: string | undefined;
}

export interface GradeSubmissionInput {
  score: number;
  feedback: string;
}

export interface Page<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}
