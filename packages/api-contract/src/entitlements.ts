// Entitlements resource schemas. An entitlement is a student's access grant to a
// course (its validity + source). Distinct from payment and from completion.
import { z } from "zod";
import { ListQuery, paginated } from "./shared.js";

export const EntitlementStatus = z.enum(["active", "expired", "revoked"]);
export type EntitlementStatus = z.infer<typeof EntitlementStatus>;

export const EntitlementSource = z.enum(["manual", "import"]);
export type EntitlementSource = z.infer<typeof EntitlementSource>;

export const Entitlement = z.object({
  id: z.string(),
  studentId: z.string(),
  studentName: z.string(),
  studentEmail: z.string(),
  courseId: z.string(),
  courseTitle: z.string(),
  status: EntitlementStatus,
  progressPercent: z.number().int(),
  grantedAt: z.string(),
  expiresAt: z.string().nullable(),
  source: EntitlementSource,
});
export type Entitlement = z.infer<typeof Entitlement>;

export const EntitlementsQuery = ListQuery.extend({
  status: EntitlementStatus.optional(),
  source: EntitlementSource.optional(),
  /** Scope to a single student (used by the student detail view). */
  studentId: z.string().optional(),
  /** Scope to a single course. */
  courseId: z.string().optional(),
});
export type EntitlementsQuery = z.infer<typeof EntitlementsQuery>;

export const EntitlementsPage = paginated(Entitlement);
export type EntitlementsPage = z.infer<typeof EntitlementsPage>;

export const GrantEntitlement = z.object({
  studentId: z.string(),
  courseId: z.string(),
  expiresAt: z.string().nullable(),
});
export type GrantEntitlement = z.infer<typeof GrantEntitlement>;

/** Revoke/reinstate access by setting the active|revoked status. */
export const SetEntitlementStatus = z.object({
  status: z.enum(["active", "revoked"]),
});
export type SetEntitlementStatus = z.infer<typeof SetEntitlementStatus>;

export const EntitlementIdParam = z.object({ id: z.string() });
export type EntitlementIdParam = z.infer<typeof EntitlementIdParam>;
