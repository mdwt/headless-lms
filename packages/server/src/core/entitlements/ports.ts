// entitlements context — ports.
import type { Entitlement, EntitlementsQuery, GrantEntitlementInput, Page } from "./model.js";
import type { UnitOfWork } from "../shared/ports.js";

// Inbound port (use cases the service exposes).
export interface EntitlementsService {
  list(orgId: string, query: EntitlementsQuery): Promise<Page<Entitlement>>;
  grant(orgId: string, input: GrantEntitlementInput): Promise<Entitlement>;
  setStatus(orgId: string, id: string, status: "active" | "revoked"): Promise<Entitlement | null>;
}

// Outbound port (persistence contract the repository fulfils).
export interface EntitlementsRepository {
  list(orgId: string, query: EntitlementsQuery): Promise<Page<Entitlement>>;
  insert(orgId: string, input: GrantEntitlementInput): Promise<Entitlement>;
  setStatus(orgId: string, id: string, status: "active" | "revoked"): Promise<Entitlement | null>;
}

/** Tx-scoped port bundle for this context's mutating use cases: the repo the
 *  UnitOfWork binds to its transaction (plus the outbox, added by the UoW). */
export interface EntitlementsTxScope {
  entitlements: EntitlementsRepository;
}

export type EntitlementsUnitOfWork = UnitOfWork<EntitlementsTxScope>;
