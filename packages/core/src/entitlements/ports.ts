// entitlements context — ports.
import type { Entitlement, EntitlementsQuery, GrantEntitlementInput, Page } from './model.js';
import type { OutboxAppender, UnitOfWork } from '../shared/ports.js';

// Inbound port (use cases the service exposes).
export interface EntitlementsService {
  list(orgId: string, query: EntitlementsQuery): Promise<Page<Entitlement>>;
  grant(orgId: string, input: GrantEntitlementInput): Promise<Entitlement>;
  setStatus(orgId: string, id: string, status: 'active' | 'revoked'): Promise<Entitlement | null>;
  /** Whether this org user currently holds active access to the course.
   *  The authority for course access — a reporting read must never be used to
   *  infer it. */
  hasCourseAccess(orgId: string, orgUserId: string, courseId: string): Promise<boolean>;
}

// Outbound port (persistence contract the repository fulfils).
export interface EntitlementsRepository {
  list(orgId: string, query: EntitlementsQuery): Promise<Page<Entitlement>>;
  insert(orgId: string, input: GrantEntitlementInput): Promise<Entitlement>;
  setStatus(orgId: string, id: string, status: 'active' | 'revoked'): Promise<Entitlement | null>;
  /** Whether this org user currently holds active access to the course.
   *  The authority for course access — a reporting read must never be used to
   *  infer it. */
  hasCourseAccess(orgId: string, orgUserId: string, courseId: string): Promise<boolean>;
}

/** Tx-scoped port bundle for this context's mutating use cases — every member
 *  is bound to the UnitOfWork's transaction, so the write and the event append
 *  commit or roll back as one. */
export interface EntitlementsTxScope {
  entitlements: EntitlementsRepository;
  outbox: OutboxAppender;
}

export type EntitlementsUnitOfWork = UnitOfWork<EntitlementsTxScope>;
