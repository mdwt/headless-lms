// entitlements context — domain events (published on the shared EventBus).
// Event names use the merchant-facing vocabulary (an enrollment in a course),
// not the internal model name. Each event carries the full Entitlement
// snapshot (the repository denormalises student and course display fields),
// so consumers need no cross-context lookups.
import type { DomainEvent } from "../shared/ports.js";
import type { Entitlement } from "./model.js";

/** A student enrolled in a course (including an upsert re-grant). */
export interface EnrollmentCreated extends DomainEvent {
  type: "enrollment.created";
  orgId: string;
  enrollment: Entitlement;
}

/** An existing enrollment changed — currently a revoked one reactivated. */
export interface EnrollmentUpdated extends DomainEvent {
  type: "enrollment.updated";
  orgId: string;
  enrollment: Entitlement;
}

/** A student was unenrolled (the enrollment's status set to revoked). */
export interface EnrollmentDeleted extends DomainEvent {
  type: "enrollment.deleted";
  orgId: string;
  enrollment: Entitlement;
}

/**
 * Not published yet: "expired" is derived from expires_at at read time, so no
 * code path observes the transition. A future scheduled sweep will publish it.
 */
export interface EnrollmentExpired extends DomainEvent {
  type: "enrollment.expired";
  orgId: string;
  enrollment: Entitlement;
}

export type EnrollmentEvent =
  | EnrollmentCreated
  | EnrollmentUpdated
  | EnrollmentDeleted
  | EnrollmentExpired;
