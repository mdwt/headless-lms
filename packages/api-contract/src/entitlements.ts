// Entitlements resource schemas. An entitlement is a student's access grant to
// a piece of content — generic over content types (course today) — its
// validity + source. Distinct from payment and from completion.
import { z } from "zod";
import { ListQuery, paginated } from "./shared.js";

export const EntitlementStatus = z.enum(["active", "expired", "revoked"]);
export type EntitlementStatus = z.infer<typeof EntitlementStatus>;

export const ContentType = z.enum(["course"]);
export type ContentType = z.infer<typeof ContentType>;

/** Reference to the granted content: identity + display name (join-derived).
 *  The full content object lives on its own resource. */
export const ContentRef = z.object({
  id: z.string(),
  type: ContentType,
  title: z.string(),
});
export type ContentRef = z.infer<typeof ContentRef>;

export const Entitlement = z.object({
  id: z.string(),
  studentId: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  studentEmail: z.string(),
  content: ContentRef,
  status: EntitlementStatus,
  grantedAt: z.string(),
  expiresAt: z.string().nullable(),
  /** Free text: "manual", "import", integration ids, … */
  source: z.string(),
});
export type Entitlement = z.infer<typeof Entitlement>;

export const EntitlementsQuery = ListQuery.extend({
  status: EntitlementStatus.optional(),
  source: z.string().optional(),
  /** Scope to a single student (used by the student detail view). */
  studentId: z.string().optional(),
  /** Scope to a single piece of content. */
  contentId: z.string().optional(),
  /** Scope to one content type. */
  type: ContentType.optional(),
});
export type EntitlementsQuery = z.infer<typeof EntitlementsQuery>;

export const EntitlementsPage = paginated(Entitlement);
export type EntitlementsPage = z.infer<typeof EntitlementsPage>;

export const GrantEntitlement = z.object({
  studentId: z.string(),
  contentId: z.string(),
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
