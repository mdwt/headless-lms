// enrollments context — domain entities & DTOs. Framework-free.

export type EnrollmentStatus = "active" | "expired" | "revoked";
export type EnrollmentSource = "manual" | "purchase" | "import";

export interface Enrollment {
  readonly id: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  courseId: string;
  courseTitle: string;
  status: EnrollmentStatus;
  progressPercent: number;
  grantedAt: string;
  expiresAt: string | null;
  source: EnrollmentSource;
}

export interface EnrollmentsQuery {
  page: number;
  pageSize: number;
  search?: string | undefined;
  sort?: string | undefined;
  status?: EnrollmentStatus | undefined;
  source?: EnrollmentSource | undefined;
  studentId?: string | undefined;
  courseId?: string | undefined;
}

export interface GrantEnrollmentInput {
  studentId: string;
  courseId: string;
  expiresAt: string | null;
}

export interface Page<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}
