// entitlements context — domain entities, DTOs, and events.
// An entitlement is a student's access grant to a course: its validity and where
// it came from. Access is distinct from completion (progress) and from identity.
import type { DomainEvent } from "./shared.js";

export type EntitlementStatus = "active" | "expired" | "revoked";
export type EntitlementSource = "manual" | "import";

export interface Enrollment {
  readonly id: string;
  studentId: string;
  firstName: string;
  lastName: string;
  studentEmail: string;
  courseId: string;
  courseTitle: string;
  status: EntitlementStatus;
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

export interface GrantEnrollmentInput {
  studentId: string;
  courseId: string;
  expiresAt: string | null;
}

/** A student enrolled in a course = */
export interface EnrollmentCreated extends DomainEvent {
  type: "enrollment.created";
  enrollment: Enrollment;
}

export interface EnrollmentUpdated extends DomainEvent {
  type: "enrollment.updated";
  enrollment: Enrollment;
}

export interface EnrollmentDeleted extends DomainEvent {
  type: "enrollment.deleted";
  enrollment: Enrollment;
}


export interface EnrollmentExpired extends DomainEvent {
  type: "enrollment.expired";
  enrollment: Enrollment;
}

export type EnrollmentEvent =
  | EnrollmentCreated
  | EnrollmentUpdated
  | EnrollmentDeleted
  | EnrollmentExpired;
