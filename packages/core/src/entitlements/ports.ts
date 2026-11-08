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
import type { Event, Space, SpaceRowLock } from '../content/index.js';
import type { Actor } from '../shared/actor.js';
import type { Permission } from '../types/index.js';

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
  isCommunityMember(communityId: string, actor: Actor): Promise<boolean>;
  canOpenSpace(spaceId: string, actor: Actor): Promise<boolean>;
  canOpen(space: OpenableSpace, actor: Actor): Promise<boolean>;
  openSpaceIds(communityId: string, actor: Actor): Promise<string[]>;
  openSpacesFor(communityId: string, actor: Actor): Promise<Space[]>;
  spaceStandings(communityId: string, actor: Actor): Promise<Record<string, SpaceMember['status']>>;
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
  granted: boolean;
  activeInSpace: boolean;
}

export interface PermissionHolders {
  holders(orgId: string, permission: Permission, on?: string): Promise<string[]>;
  systemActor(orgId: string): Actor;
}

export interface SpaceReader {
  getSpace(spaceId: string, actor: Actor): Promise<Space | null>;
  listSpaces(communityId: string, actor: Actor): Promise<Space[]>;
  getEvent(eventId: string, actor: Actor): Promise<Event>;
}

export interface RevokeGrantInput {
  orgUserId: string;
  contentId: string;
}

export interface CommunityReaders {
  all: boolean;
  ids: string[];
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
  excluding?: string[];
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
  list(query: EntitlementsQuery, actor: Actor): Promise<Page<Entitlement>>;
  grant(input: GrantEntitlementInput, actor: Actor): Promise<Entitlement>;
  ensureGrant(input: GrantEntitlementInput, actor: Actor): Promise<Entitlement>;
  setStatus(id: string, status: 'active' | 'revoked', actor: Actor): Promise<Entitlement>;
  revoke(input: RevokeGrantInput, actor: Actor): Promise<Entitlement>;
  /** Whether this org user can open the content right now, through a grant to
   *  it or to a bundle holding it. The only access check — nothing else may
   *  derive access from grants. */
  hasAccess(orgId: string, orgUserId: string, contentId: string): Promise<boolean>;
  /** Ids of the content this org user can open right now, optionally of one type. */
  listAccessibleContent(orgId: string, orgUserId: string, type?: ContentType): Promise<string[]>;
  holdsAnyGrant(orgId: string, orgUserId: string): Promise<boolean>;
  /** `communities:read` on the community, or a member of it holding `communities:moderate` on it. */
  opensEverySpace(actor: Actor, communityId: string): Promise<boolean>;
  requestJoin(communityId: string, spaceId: string, actor: Actor): Promise<SpaceMember>;
  invite(
    communityId: string,
    spaceId: string,
    orgUserId: string,
    actor: Actor,
  ): Promise<SpaceMember>;
  addSpaceMember(
    communityId: string,
    spaceId: string,
    orgUserId: string,
    actor: Actor,
  ): Promise<SpaceMember>;
  accept(communityId: string, spaceId: string, actor: Actor): Promise<SpaceMember>;
  approve(
    communityId: string,
    spaceId: string,
    orgUserId: string,
    actor: Actor,
  ): Promise<SpaceMember>;
  decline(
    communityId: string,
    spaceId: string,
    orgUserId: string,
    actor: Actor,
  ): Promise<SpaceMember>;
  refuse(communityId: string, spaceId: string, actor: Actor): Promise<SpaceMember>;
  leave(communityId: string, spaceId: string, actor: Actor): Promise<SpaceMember>;
  remove(
    communityId: string,
    spaceId: string,
    orgUserId: string,
    actor: Actor,
  ): Promise<SpaceMember>;
  listSpaceMembers(
    communityId: string,
    spaceId: string,
    query: { page: number; pageSize: number },
    actor: Actor,
  ): Promise<Page<SpaceMember>>;
  expireDueGrants(now: Date): Promise<void>;
  communitiesOpenedBy(orgId: string, grant: GrantTarget): Promise<string[]>;
  communityModeratorIds(orgId: string, communityId: string): Promise<string[]>;
  communityIdsOpenedFor(orgId: string, orgUserId: string): Promise<string[]>;
  openCommunityIds(actor: Actor): Promise<string[]>;
  communityMemberIds(orgId: string, communityId: string): Promise<string[]>;
  grantedOrgUserIds(orgId: string, contentId: string): Promise<string[]>;
  countActiveSpaceMembers(orgId: string, spaceId: string): Promise<number>;
  /** Org users who open every space of the community, so hold no place in its spaces. */
  everySpaceOpeners(orgId: string, communityId: string): Promise<string[]>;
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
  holdsAnyGrant(orgId: string, orgUserId: string): Promise<boolean>;
  contentTypeOf(orgId: string, contentId: string): Promise<ContentType | null>;
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
  countActiveSpaceMembers(orgId: string, spaceId: string, excluding: string[]): Promise<number>;
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
  orgIdsWithDueNotices(now: Date, until: Date): Promise<string[]>;
  claimNotice(orgId: string, notice: EntitlementNotice, now: Date): Promise<boolean>;
  communityMemberIds(orgId: string, communityId: string, readerIds: string[]): Promise<string[]>;
  communityIdsOpenedFor(orgId: string, orgUserId: string): Promise<string[]>;
  openCommunityIds(orgId: string, orgUserId: string, readers: CommunityReaders): Promise<string[]>;
  grantedOrgUserIds(orgId: string, contentId: string): Promise<string[]>;
  lockCapacity(orgId: string, contentId: string): Promise<void>;
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
