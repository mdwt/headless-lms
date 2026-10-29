// entitlements context — ports.
import type {
  ContentType,
  Entitlement,
  EntitlementsQuery,
  GrantEntitlementInput,
  Page,
} from './model.js';
import type { OutboxAppender, UnitOfWork } from '../shared/ports.js';

// Inbound port (use cases the service exposes).
export interface EntitlementsService {
  list(orgId: string, query: EntitlementsQuery): Promise<Page<Entitlement>>;
  grant(orgId: string, input: GrantEntitlementInput): Promise<Entitlement>;
  setStatus(orgId: string, id: string, status: 'active' | 'revoked'): Promise<Entitlement | null>;
  /** Whether this org user can open the content right now, through a grant to
   *  it or to a bundle holding it. The only access check — nothing else may
   *  derive access from grants. */
  hasAccess(orgId: string, orgUserId: string, contentId: string): Promise<boolean>;
  /** Ids of the content this org user can open right now, optionally of one type. */
  listAccessibleContent(orgId: string, orgUserId: string, type?: ContentType): Promise<string[]>;
}

// Outbound port (persistence contract the repository fulfils).
export interface EntitlementsRepository {
  list(orgId: string, query: EntitlementsQuery): Promise<Page<Entitlement>>;
  insert(orgId: string, input: GrantEntitlementInput): Promise<Entitlement>;
  setStatus(orgId: string, id: string, status: 'active' | 'revoked'): Promise<Entitlement | null>;
  hasAccess(orgId: string, orgUserId: string, contentId: string): Promise<boolean>;
  listAccessibleContent(orgId: string, orgUserId: string, type?: ContentType): Promise<string[]>;
}

/** Tx-scoped port bundle for this context's mutating use cases — every member
 *  is bound to the UnitOfWork's transaction, so the write and the event append
 *  commit or roll back as one. */
export interface EntitlementsTxScope {
  entitlements: EntitlementsRepository;
  outbox: OutboxAppender;
}

export type EntitlementsUnitOfWork = UnitOfWork<EntitlementsTxScope>;
