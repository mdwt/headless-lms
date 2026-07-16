// entitlements context — domain events (published on the shared EventBus).
// Each event carries the full Entitlement snapshot (the repository denormalises
// student and course display fields), so consumers need no cross-context lookups.
import type { DomainEvent } from "../shared/ports.js";
import type { Entitlement } from "./model.js";

export interface EntitlementGranted extends DomainEvent {
  type: "entitlement.granted";
  orgId: string;
  entitlement: Entitlement;
}

export interface EntitlementRevoked extends DomainEvent {
  type: "entitlement.revoked";
  orgId: string;
  entitlement: Entitlement;
}

export interface EntitlementReinstated extends DomainEvent {
  type: "entitlement.reinstated";
  orgId: string;
  entitlement: Entitlement;
}

/**
 * Not published yet: "expired" is derived from expires_at at read time, so no
 * code path observes the transition. A future scheduled sweep will publish it.
 */
export interface EntitlementExpired extends DomainEvent {
  type: "entitlement.expired";
  orgId: string;
  entitlement: Entitlement;
}

export type EntitlementEvent =
  | EntitlementGranted
  | EntitlementRevoked
  | EntitlementReinstated
  | EntitlementExpired;
