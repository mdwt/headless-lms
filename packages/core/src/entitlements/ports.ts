// entitlements context — ports.
import type {
  ContentType,
  Entitlement,
  EntitlementsQuery,
  GrantEntitlementInput,
  Page,
  SpaceMember,
  SpaceMemberSource,
  SpaceMemberStatus,
} from './model.js';
import type { OutboxAppender, UnitOfWork } from '../shared/ports.js';
import type { Space, SpaceRowLock } from '../content/index.js';
import type { Role } from '../organizations/index.js';
import type { Actor } from '../shared/actor.js';

export interface GrantTarget {
  contentId: string | null;
  bundleId: string | null;
}

export type SpaceAccessRule = 'all_members' | 'by_request' | 'by_invite';

export interface OpenableSpace {
  id: string;
  communityId: string;
  accessRule: SpaceAccessRule;
}

export interface CommunityAccessReader {
  isCommunityMember(orgId: string, actor: Actor, communityId: string): Promise<boolean>;
  canOpenSpace(orgId: string, actor: Actor, spaceId: string): Promise<boolean>;
  canOpen(orgId: string, actor: Actor, space: OpenableSpace): Promise<boolean>;
  openSpaceIds(orgId: string, actor: Actor, communityId: string): Promise<string[]>;
  openSpacesFor(orgId: string, actor: Actor, communityId: string): Promise<Space[]>;
  spaceStandings(
    orgId: string,
    actor: Actor,
    communityId: string,
  ): Promise<Record<string, SpaceMember['status']>>;
  communityMembersAmong(
    orgId: string,
    communityId: string,
    orgUserIds: string[],
  ): Promise<string[]>;
  spaceOpenersAmong(orgId: string, spaceId: string, orgUserIds: string[]): Promise<string[]>;
  spaceOpeners(orgId: string, spaceId: string): Promise<string[]>;
}

export type EntitlementNotice =
  | { kind: 'expired'; entitlementId: string; expiresAt: Date }
  | { kind: 'ending_soon'; entitlementId: string; communityId: string; expiresAt: Date };

export interface EndingGrant {
  grant: Entitlement;
  communityId: string;
}

export interface EndingGrantKey {
  entitlementId: string;
  communityId: string;
}

export interface AccessFacts {
  orgUserId: string;
  role: Role;
  member: boolean;
  activeInSpace: boolean;
}

export interface GrantKey {
  orgUserId: string;
  contentId?: string | null;
  bundleId?: string | null;
}

export interface SpaceMembersQuery {
  page: number;
  pageSize: number;
  statuses?: SpaceMemberStatus[];
}

export interface InsertSpaceMemberInput {
  communityId: string;
  spaceId: string;
  orgUserId: string;
  status: SpaceMemberStatus;
  source: SpaceMemberSource;
}

// Inbound port (use cases the service exposes).
export interface EntitlementsService extends CommunityAccessReader {
  list(orgId: string, query: EntitlementsQuery): Promise<Page<Entitlement>>;
  grant(orgId: string, input: GrantEntitlementInput): Promise<Entitlement>;
  ensureGrant(orgId: string, input: GrantEntitlementInput): Promise<Entitlement>;
  setStatus(orgId: string, id: string, status: 'active' | 'revoked'): Promise<Entitlement | null>;
  /** Whether this org user can open the content right now, through a grant to
   *  it or to a bundle holding it. The only access check — nothing else may
   *  derive access from grants. */
  hasAccess(orgId: string, orgUserId: string, contentId: string): Promise<boolean>;
  /** Ids of the content this org user can open right now, optionally of one type. */
  listAccessibleContent(orgId: string, orgUserId: string, type?: ContentType): Promise<string[]>;
  requestJoin(
    orgId: string,
    actor: Actor,
    communityId: string,
    spaceId: string,
  ): Promise<SpaceMember>;
  invite(
    orgId: string,
    actor: Actor,
    communityId: string,
    spaceId: string,
    orgUserId: string,
  ): Promise<SpaceMember>;
  addSpaceMember(
    orgId: string,
    actor: Actor,
    communityId: string,
    spaceId: string,
    orgUserId: string,
  ): Promise<SpaceMember>;
  accept(orgId: string, actor: Actor, communityId: string, spaceId: string): Promise<SpaceMember>;
  approve(
    orgId: string,
    actor: Actor,
    communityId: string,
    spaceId: string,
    orgUserId: string,
  ): Promise<SpaceMember>;
  decline(
    orgId: string,
    actor: Actor,
    communityId: string,
    spaceId: string,
    orgUserId: string,
  ): Promise<SpaceMember>;
  refuse(orgId: string, actor: Actor, communityId: string, spaceId: string): Promise<SpaceMember>;
  leave(orgId: string, actor: Actor, communityId: string, spaceId: string): Promise<SpaceMember>;
  remove(
    orgId: string,
    actor: Actor,
    communityId: string,
    spaceId: string,
    orgUserId: string,
  ): Promise<SpaceMember>;
  listSpaceMembers(
    orgId: string,
    actor: Actor,
    communityId: string,
    spaceId: string,
    query: { page: number; pageSize: number },
  ): Promise<Page<SpaceMember>>;
  expireDue(orgId: string, now: Date): Promise<void>;
  hasDueNotices(orgId: string, now: Date): Promise<boolean>;
  communitiesOpenedBy(orgId: string, grant: GrantTarget): Promise<string[]>;
  communityModeratorIds(orgId: string, communityId: string): Promise<string[]>;
  communityIdsOpenedFor(orgId: string, orgUserId: string): Promise<string[]>;
  countActiveSpaceMembers(orgId: string, spaceId: string): Promise<number>;
}

// Outbound port (persistence contract the repository fulfils).
export interface EntitlementsRepository {
  list(orgId: string, query: EntitlementsQuery): Promise<Page<Entitlement>>;
  insert(orgId: string, input: GrantEntitlementInput): Promise<Entitlement>;
  insertIfAbsent(orgId: string, input: GrantEntitlementInput): Promise<Entitlement | null>;
  lockGrant(orgId: string, key: GrantKey): Promise<Entitlement | null>;
  setExpiresAt(orgId: string, id: string, expiresAt: Date | null): Promise<Entitlement | null>;
  setStatus(orgId: string, id: string, status: 'active' | 'revoked'): Promise<Entitlement | null>;
  hasAccess(orgId: string, orgUserId: string, contentId: string): Promise<boolean>;
  listAccessibleContent(orgId: string, orgUserId: string, type?: ContentType): Promise<string[]>;
  hasCommunityAccess(orgId: string, orgUserId: string, communityId: string): Promise<boolean>;
  communitiesOpenedBy(orgId: string, grant: GrantTarget): Promise<string[]>;
  accessAmong(
    orgId: string,
    communityId: string,
    spaceId: string | null,
    orgUserIds: string[],
  ): Promise<AccessFacts[]>;
  findSpaceMember(orgId: string, spaceId: string, orgUserId: string): Promise<SpaceMember | null>;
  listSpaceMembersFor(
    orgId: string,
    orgUserId: string,
    communityId: string,
  ): Promise<SpaceMember[]>;
  lockSpaceMember(orgId: string, spaceId: string, orgUserId: string): Promise<SpaceMember | null>;
  listSpaceMembers(
    orgId: string,
    spaceId: string,
    query: SpaceMembersQuery,
  ): Promise<Page<SpaceMember>>;
  insertSpaceMember(orgId: string, input: InsertSpaceMemberInput): Promise<SpaceMember>;
  updateSpaceMemberStatus(
    orgId: string,
    id: string,
    status: SpaceMemberStatus,
  ): Promise<SpaceMember | null>;
  deleteSpaceMember(orgId: string, id: string): Promise<void>;
  countActiveSpaceMembers(orgId: string, spaceId: string): Promise<number>;
  activeSpaceIds(orgId: string, orgUserId: string, communityId: string): Promise<string[]>;
  /** Expired grants with no expiry notice, in id order, after `afterId` when given. */
  listGrantsExpiredBy(
    orgId: string,
    now: Date,
    limit: number,
    afterId?: string,
  ): Promise<Entitlement[]>;
  /** Grants ending in the window with no notice, in (grant id, community id) order, after `afterKey`. */
  listGrantsEndingBetween(
    orgId: string,
    after: Date,
    until: Date,
    limit: number,
    afterKey?: EndingGrantKey,
  ): Promise<EndingGrant[]>;
  hasDueNotices(orgId: string, now: Date, until: Date): Promise<boolean>;
  claimNotice(orgId: string, notice: EntitlementNotice, now: Date): Promise<boolean>;
  communityModeratorIds(orgId: string, communityId: string): Promise<string[]>;
  communityMemberIds(orgId: string, communityId: string): Promise<string[]>;
  communityIdsOpenedFor(orgId: string, orgUserId: string): Promise<string[]>;
}

/** Tx-scoped port bundle for this context's mutating use cases — every member
 *  is bound to the UnitOfWork's transaction, so the write and the event append
 *  commit or roll back as one. */
export interface EntitlementsTxScope {
  entitlements: EntitlementsRepository;
  spaces: SpaceRowLock;
  outbox: OutboxAppender;
}

export type EntitlementsUnitOfWork = UnitOfWork<EntitlementsTxScope>;
