// entitlements context — domain entities, DTOs, and events.
// An entitlement is a student's access grant to a piece of content (its
// validity and where it came from), generic over content types. Access is
// distinct from completion (progress) and from identity.
import type { DomainEvent } from "./shared.js";
import type { ContentType } from "./content.js";

export type EntitlementStatus = "active" | "expired" | "revoked";

/** Reference to the granted content: identity + display name. NOT the full
 *  course/podcast/… object — that stays one GET away on its own resource, so
 *  the entitlements contract never changes when a content type gains fields. */
export interface ContentRef {
  id: string;
  type: ContentType;
  /** Display name, derived at read time (join to the concrete table), never stored. */
  title: string;
}

export interface Entitlement {
  readonly id: string;
  studentId: string;
  firstName: string;
  lastName: string;
  studentEmail: string;
  content: ContentRef;
  status: EntitlementStatus;
  grantedAt: string;
  expiresAt: string | null;
  /** Free text: "manual", "import", integration ids, … */
  source: string;
}

export interface EntitlementsQuery {
  page: number;
  pageSize: number;
  search?: string | undefined;
  sort?: string | undefined;
  status?: EntitlementStatus | undefined;
  source?: string | undefined;
  studentId?: string | undefined;
  contentId?: string | undefined;
  type?: ContentType | undefined;
}

export interface GrantEntitlementInput {
  studentId: string;
  contentId: string;
  expiresAt: string | null;
}

/** A student was granted access to a piece of content. */
export interface EntitlementCreated extends DomainEvent {
  type: "entitlement.created";
  entitlement: Entitlement;
}

export interface EntitlementUpdated extends DomainEvent {
  type: "entitlement.updated";
  entitlement: Entitlement;
}

export interface EntitlementDeleted extends DomainEvent {
  type: "entitlement.deleted";
  entitlement: Entitlement;
}

export interface EntitlementExpired extends DomainEvent {
  type: "entitlement.expired";
  entitlement: Entitlement;
}

export type EntitlementEvent =
  | EntitlementCreated
  | EntitlementUpdated
  | EntitlementDeleted
  | EntitlementExpired;
