// entitlements context — ports.
import type { Enrollment, EntitlementsQuery, GrantEnrollmentInput, Page } from "./model.js";
import type { OutboxAppender, UnitOfWork } from "../shared/ports.js";

// Inbound port (use cases the service exposes).
export interface EntitlementsService {
  list(orgId: string, query: EntitlementsQuery): Promise<Page<Enrollment>>;
  grant(orgId: string, input: GrantEnrollmentInput): Promise<Enrollment>;
  setStatus(orgId: string, id: string, status: "active" | "revoked"): Promise<Enrollment | null>;
}

// Outbound port (persistence contract the repository fulfils).
export interface EntitlementsRepository {
  list(orgId: string, query: EntitlementsQuery): Promise<Page<Enrollment>>;
  insert(orgId: string, input: GrantEnrollmentInput): Promise<Enrollment>;
  setStatus(orgId: string, id: string, status: "active" | "revoked"): Promise<Enrollment | null>;
}

/** Tx-scoped port bundle for this context's mutating use cases — every member
 *  is bound to the UnitOfWork's transaction, so the write and the event append
 *  commit or roll back as one. */
export interface EntitlementsTxScope {
  entitlements: EntitlementsRepository;
  outbox: OutboxAppender;
}

export type EntitlementsUnitOfWork = UnitOfWork<EntitlementsTxScope>;
