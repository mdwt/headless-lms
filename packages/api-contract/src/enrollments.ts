// Enrollments resource schemas.
import { z } from "zod";
import { ListQuery, paginated } from "./shared.js";

export const EnrollmentStatus = z.enum(["active", "expired", "revoked"]);
export type EnrollmentStatus = z.infer<typeof EnrollmentStatus>;

export const EnrollmentSource = z.enum(["manual", "purchase", "import"]);
export type EnrollmentSource = z.infer<typeof EnrollmentSource>;

export const Enrollment = z.object({
  id: z.string(),
  studentId: z.string(),
  studentName: z.string(),
  studentEmail: z.string(),
  courseId: z.string(),
  courseTitle: z.string(),
  status: EnrollmentStatus,
  progressPercent: z.number().int(),
  grantedAt: z.string(),
  expiresAt: z.string().nullable(),
  source: EnrollmentSource,
});
export type Enrollment = z.infer<typeof Enrollment>;

export const EnrollmentsQuery = ListQuery.extend({
  status: EnrollmentStatus.optional(),
  source: EnrollmentSource.optional(),
});
export type EnrollmentsQuery = z.infer<typeof EnrollmentsQuery>;

export const EnrollmentsPage = paginated(Enrollment);
export type EnrollmentsPage = z.infer<typeof EnrollmentsPage>;

export const GrantEnrollment = z.object({
  studentId: z.string(),
  courseId: z.string(),
  expiresAt: z.string().nullable(),
});
export type GrantEnrollment = z.infer<typeof GrantEnrollment>;

/** Revoke/reinstate access by setting the active|revoked status. */
export const SetEnrollmentStatus = z.object({
  status: z.enum(["active", "revoked"]),
});
export type SetEnrollmentStatus = z.infer<typeof SetEnrollmentStatus>;

export const EnrollmentIdParam = z.object({ id: z.string() });
export type EnrollmentIdParam = z.infer<typeof EnrollmentIdParam>;
