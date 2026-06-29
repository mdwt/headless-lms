// entitlements context — domain entities & DTOs. Framework-free.
// An entitlement is a student's access grant to a course: its validity and where
// it came from. Access is distinct from completion (progress) and from identity.

export type EntitlementStatus = "active" | "expired" | "revoked";
export type EntitlementSource = "manual" | "import";

export interface Entitlement {
  readonly id: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  courseId: string;
  courseTitle: string;
  status: EntitlementStatus;
  progressPercent: number;
  grantedAt: string;
  expiresAt: string | null;
  source: EntitlementSource;
}

export interface EntitlementsQuery {
  page: number;
  pageSize: number;
  search?: string | undefined;
  sort?: string | undefined;
  status?: EntitlementStatus | undefined;
  source?: EntitlementSource | undefined;
  studentId?: string | undefined;
  courseId?: string | undefined;
}

export interface GrantEntitlementInput {
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
