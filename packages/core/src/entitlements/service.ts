// entitlements context — service implementation (inbound port).
//
// Mutations run inside the context's UnitOfWork: the domain write and the
// outbox append commit in ONE transaction (transactional outbox). This
// service never publishes — the outbox relay republishes committed events to
// the EventBus at-least-once.
import type { CommunityReader, Space, SpaceRowLock } from '../content/index.js';
import type {
  Entitlement,
  EntitlementsQuery,
  GrantEntitlementInput,
  Page,
  SpaceMember,
} from './model.js';
import type {
  AccessFacts,
  EntitlementsRepository,
  EntitlementsService,
  EntitlementsUnitOfWork,
  GrantTarget,
  InsertSpaceMemberInput,
  OpenableSpace,
  SpaceAccessRule,
} from './ports.js';
import type { Actor } from '../shared/actor.js';
import type { Logger, NewDomainEvent, OutboxAppender } from '../shared/ports.js';
import { noopLogger } from '../shared/logger.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../shared/errors.js';
import { canModerate, isStaffRole } from '../organizations/index.js';
import { entitlementEvents } from './events.js';
import { laterExpiry, opensSpace } from './rules.js';

const ENDING_SOON_MS = 7 * 24 * 60 * 60 * 1000;

export type EntitlementsServiceParams = {
  /** Read-only access (list) — runs outside any transaction. */
  repo: EntitlementsRepository;
  content: CommunityReader;
  /** Atomic write scope: tx-bound repo + outbox appender. */
  uow: EntitlementsUnitOfWork;
  logger?: Logger;
};

export class EntitlementsServiceImpl implements EntitlementsService {
  private readonly repo: EntitlementsRepository;
  private readonly content: CommunityReader;
  private readonly uow: EntitlementsUnitOfWork;
  private readonly logger: Logger;

  constructor(params: EntitlementsServiceParams) {
    this.repo = params.repo;
    this.content = params.content;
    this.uow = params.uow;
    this.logger = params.logger ?? noopLogger;
  }

  list(orgId: string, query: EntitlementsQuery): Promise<Page<Entitlement>> {
    return this.repo.list(orgId, query);
  }

  async grant(orgId: string, input: GrantEntitlementInput): Promise<Entitlement> {
    const entitlement = await this.uow.run(async ({ entitlements, outbox }) => {
      const created = await entitlements.insert(orgId, input);
      await outbox.append([
        entitlementEvents.entitlementCreated.make({
          orgId,
          data: created,
        }),
      ]);
      return created;
    });
    this.logger.info('entitlement granted', {
      orgId,
      entitlementId: entitlement.id,
      orgUserId: entitlement.orgUserId,
      bundleId: entitlement.bundleId,
      contentId: entitlement.contentId,
    });
    return entitlement;
  }

  async ensureGrant(orgId: string, input: GrantEntitlementInput): Promise<Entitlement> {
    const { entitlement, change } = await this.uow.run(async ({ entitlements, outbox }) => {
      const created = await entitlements.insertIfAbsent(orgId, input);
      if (created) {
        await outbox.append([entitlementEvents.entitlementCreated.make({ orgId, data: created })]);
        return { entitlement: created, change: 'created' as const };
      }
      const existing = await entitlements.lockGrant(orgId, input);
      if (!existing) {
        throw new ConflictError('The grant changed while it was being given');
      }
      if (existing.status === 'revoked') {
        return { entitlement: existing, change: null };
      }
      const expiresAt = laterExpiry(existing.expiresAt, input.expiresAt ?? null);
      if (expiresAt?.getTime() === existing.expiresAt?.getTime()) {
        return { entitlement: existing, change: null };
      }
      const updated = await entitlements.setExpiresAt(orgId, existing.id, expiresAt);
      if (!updated) {
        throw new NotFoundError('Entitlement', existing.id);
      }
      await outbox.append([entitlementEvents.entitlementUpdated.make({ orgId, data: updated })]);
      return { entitlement: updated, change: 'updated' as const };
    });
    if (change) {
      this.logger.info(change === 'created' ? 'entitlement granted' : 'entitlement extended', {
        orgId,
        entitlementId: entitlement.id,
        orgUserId: entitlement.orgUserId,
        bundleId: entitlement.bundleId,
        contentId: entitlement.contentId,
      });
    }
    return entitlement;
  }

  async setStatus(
    orgId: string,
    id: string,
    status: 'active' | 'revoked',
  ): Promise<Entitlement | null> {
    const entitlement = await this.uow.run(async ({ entitlements, outbox }) => {
      const updated = await entitlements.setStatus(orgId, id, status);
      if (!updated) {
        return null;
      }
      await outbox.append([
        status === 'revoked'
          ? entitlementEvents.entitlementDeleted.make({
              orgId,
              data: updated,
            })
          : entitlementEvents.entitlementUpdated.make({
              orgId,
              data: updated,
            }),
      ]);
      return updated;
    });
    if (entitlement) {
      this.logger.info('entitlement status changed', { orgId, entitlementId: id, status });
    }
    return entitlement;
  }

  hasCourseAccess(orgId: string, orgUserId: string, courseId: string): Promise<boolean> {
    return this.repo.hasCourseAccess(orgId, orgUserId, courseId);
  }

  async isCommunityMember(orgId: string, actor: Actor, communityId: string): Promise<boolean> {
    const facts = await this.accessOf(orgId, actor.id, communityId, null);
    return facts?.member === true;
  }

  async canOpenSpace(orgId: string, actor: Actor, spaceId: string): Promise<boolean> {
    const space = await this.content.getSpace(orgId, spaceId);
    if (!space) {
      return false;
    }
    return this.canOpen(orgId, actor, space);
  }

  async canOpen(orgId: string, actor: Actor, space: OpenableSpace): Promise<boolean> {
    const facts = await this.accessOf(orgId, actor.id, space.communityId, space.id);
    if (!facts) {
      return false;
    }
    return opensSpace(facts.role, facts.member, space.accessRule, facts.activeInSpace);
  }

  async spaceStandings(
    orgId: string,
    actor: Actor,
    communityId: string,
  ): Promise<Record<string, SpaceMember['status']>> {
    const rows = await this.repo.listSpaceMembersFor(orgId, actor.id, communityId);
    return Object.fromEntries(rows.map((row) => [row.spaceId, row.status]));
  }

  async openSpacesFor(orgId: string, actor: Actor, communityId: string): Promise<Space[]> {
    const facts = await this.accessOf(orgId, actor.id, communityId, null);
    if (!facts?.member) {
      return [];
    }
    const [spaces, activeIds] = await Promise.all([
      this.content.listSpaces(orgId, communityId),
      this.repo.activeSpaceIds(orgId, actor.id, communityId),
    ]);
    const active = new Set(activeIds);
    return spaces.filter((space) =>
      opensSpace(facts.role, facts.member, space.accessRule, active.has(space.id)),
    );
  }

  async openSpaceIds(orgId: string, actor: Actor, communityId: string): Promise<string[]> {
    const spaces = await this.openSpacesFor(orgId, actor, communityId);
    return spaces.map((space) => space.id);
  }

  async communityMembersAmong(
    orgId: string,
    communityId: string,
    orgUserIds: string[],
  ): Promise<string[]> {
    if (orgUserIds.length === 0) {
      return [];
    }
    const facts = await this.repo.accessAmong(orgId, communityId, null, orgUserIds);
    return facts.filter((fact) => fact.member).map((fact) => fact.orgUserId);
  }

  async spaceOpenersAmong(orgId: string, spaceId: string, orgUserIds: string[]): Promise<string[]> {
    if (orgUserIds.length === 0) {
      return [];
    }
    const space = await this.content.getSpace(orgId, spaceId);
    if (!space) {
      return [];
    }
    const facts = await this.repo.accessAmong(orgId, space.communityId, space.id, orgUserIds);
    return facts
      .filter((fact) => opensSpace(fact.role, fact.member, space.accessRule, fact.activeInSpace))
      .map((fact) => fact.orgUserId);
  }

  async spaceOpeners(orgId: string, spaceId: string): Promise<string[]> {
    const space = await this.content.getSpace(orgId, spaceId);
    if (!space) {
      return [];
    }
    const members = await this.repo.communityMemberIds(orgId, space.communityId);
    return this.spaceOpenersAmong(orgId, spaceId, members);
  }

  communitiesOpenedBy(orgId: string, grant: GrantTarget): Promise<string[]> {
    return this.repo.communitiesOpenedBy(orgId, grant);
  }

  communityModeratorIds(orgId: string, communityId: string): Promise<string[]> {
    return this.repo.communityModeratorIds(orgId, communityId);
  }

  communityIdsOpenedFor(orgId: string, orgUserId: string): Promise<string[]> {
    return this.repo.communityIdsOpenedFor(orgId, orgUserId);
  }

  countActiveSpaceMembers(orgId: string, spaceId: string): Promise<number> {
    return this.repo.countActiveSpaceMembers(orgId, spaceId);
  }

  async requestJoin(
    orgId: string,
    actor: Actor,
    communityId: string,
    spaceId: string,
  ): Promise<SpaceMember> {
    const space = await this.requireSpaceIn(orgId, communityId, spaceId);
    this.assertRule(space.accessRule, 'by_request');
    if (canModerate(actor.role)) {
      throw new ForbiddenError('Staff do not request a place in a space');
    }
    await this.assertGrant(orgId, actor, actor.id, space.communityId);
    const created = await this.createMember(orgId, actor, space, actor.id, 'requested', 'request');
    this.logger.info('space member created', {
      orgId,
      spaceId,
      orgUserId: actor.id,
      status: created.status,
    });
    return created;
  }

  async invite(
    orgId: string,
    actor: Actor,
    communityId: string,
    spaceId: string,
    orgUserId: string,
  ): Promise<SpaceMember> {
    const space = await this.requireSpaceIn(orgId, communityId, spaceId);
    this.assertRule(space.accessRule, 'by_invite');
    await this.assertCanManage(orgId, actor, space.communityId);
    await this.assertHolds(orgId, actor, orgUserId, space.communityId);
    const created = await this.createMember(orgId, actor, space, orgUserId, 'invited', 'invite');
    this.logger.info('space member created', { orgId, spaceId, orgUserId, status: created.status });
    return created;
  }

  async addSpaceMember(
    orgId: string,
    actor: Actor,
    communityId: string,
    spaceId: string,
    orgUserId: string,
  ): Promise<SpaceMember> {
    const space = await this.requireSpaceIn(orgId, communityId, spaceId);
    this.assertHasMembers(space.accessRule);
    await this.assertCanManage(orgId, actor, space.communityId);
    await this.assertHolds(orgId, actor, orgUserId, space.communityId);
    const created = await this.uow.run(async (scope) => {
      const locked = await this.lockSpace(scope.spaces, orgId, spaceId);
      this.assertHasMembers(locked.accessRule);
      return this.insertMember(
        scope.entitlements,
        scope.outbox,
        orgId,
        actor,
        {
          communityId: space.communityId,
          spaceId,
          orgUserId,
          status: 'active',
          source: 'manual',
        },
        locked,
      );
    });
    this.logger.info('space member created', { orgId, spaceId, orgUserId, status: created.status });
    return created;
  }

  async accept(
    orgId: string,
    actor: Actor,
    communityId: string,
    spaceId: string,
  ): Promise<SpaceMember> {
    this.assertHolder(actor);
    const space = await this.requireSpaceIn(orgId, communityId, spaceId);
    this.assertRule(space.accessRule, 'by_invite');
    await this.assertGrant(orgId, actor, actor.id, space.communityId);
    return this.activate(orgId, actor, spaceId, actor.id, 'by_invite', 'invited', () =>
      ownRowMissing('invited'),
    );
  }

  async approve(
    orgId: string,
    actor: Actor,
    communityId: string,
    spaceId: string,
    orgUserId: string,
  ): Promise<SpaceMember> {
    const space = await this.requireSpaceIn(orgId, communityId, spaceId);
    this.assertRule(space.accessRule, 'by_request');
    await this.assertCanManage(orgId, actor, space.communityId);
    await this.assertGrant(orgId, actor, orgUserId, space.communityId);
    return this.activate(
      orgId,
      actor,
      spaceId,
      orgUserId,
      'by_request',
      'requested',
      () => new NotFoundError('Space member', orgUserId),
    );
  }

  async decline(
    orgId: string,
    actor: Actor,
    communityId: string,
    spaceId: string,
    orgUserId: string,
  ): Promise<SpaceMember> {
    const space = await this.requireSpaceIn(orgId, communityId, spaceId);
    await this.assertCanManage(orgId, actor, space.communityId);
    return this.deleteMember(
      orgId,
      actor,
      spaceId,
      orgUserId,
      'requested',
      () => new NotFoundError('Space member', orgUserId),
    );
  }

  async refuse(
    orgId: string,
    actor: Actor,
    communityId: string,
    spaceId: string,
  ): Promise<SpaceMember> {
    const space = await this.requireSpaceIn(orgId, communityId, spaceId);
    this.assertHolder(actor);
    await this.assertGrant(orgId, actor, actor.id, space.communityId);
    return this.deleteMember(orgId, actor, spaceId, actor.id, 'invited', () =>
      ownRowMissing('invited'),
    );
  }

  async leave(
    orgId: string,
    actor: Actor,
    communityId: string,
    spaceId: string,
  ): Promise<SpaceMember> {
    const space = await this.requireSpaceIn(orgId, communityId, spaceId);
    this.assertHolder(actor);
    await this.assertGrant(orgId, actor, actor.id, space.communityId);
    return this.deleteMember(orgId, actor, spaceId, actor.id, 'active', () =>
      ownRowMissing('active'),
    );
  }

  async remove(
    orgId: string,
    actor: Actor,
    communityId: string,
    spaceId: string,
    orgUserId: string,
  ): Promise<SpaceMember> {
    const space = await this.requireSpaceIn(orgId, communityId, spaceId);
    this.assertHasMembers(space.accessRule);
    await this.assertCanManage(orgId, actor, space.communityId);
    const { updated, previousStatus } = await this.uow.run(
      async ({ entitlements, spaces, outbox }) => {
        const locked = await this.lockSpace(spaces, orgId, spaceId);
        this.assertHasMembers(locked.accessRule);
        const row = await entitlements.lockSpaceMember(orgId, spaceId, orgUserId);
        if (!row) {
          throw new NotFoundError('Space member', orgUserId);
        }
        if (row.status === 'revoked') {
          throw new ConflictError('This person is already removed from the space');
        }
        const next = await entitlements.updateSpaceMemberStatus(orgId, row.id, 'revoked');
        if (!next) {
          throw new NotFoundError('Space member', row.id);
        }
        await outbox.append([
          entitlementEvents.spaceMemberUpdated.make({
            orgId,
            data: next,
            metadata: { actorOrgUserId: actor.id, previousStatus: row.status },
          }),
        ]);
        return { updated: next, previousStatus: row.status };
      },
    );
    this.logger.info('space member removed', { orgId, spaceId, orgUserId, previousStatus });
    return updated;
  }

  async listSpaceMembers(
    orgId: string,
    actor: Actor,
    communityId: string,
    spaceId: string,
  ): Promise<SpaceMember[]> {
    const space = await this.requireSpaceIn(orgId, communityId, spaceId);
    if (!(await this.canOpen(orgId, actor, space))) {
      throw new ForbiddenError('You cannot open this space');
    }
    const rows = await this.repo.listSpaceMembers(orgId, spaceId);
    if (canModerate(actor.role)) {
      return rows;
    }
    return rows.filter((row) => row.status === 'active');
  }

  hasDueNotices(orgId: string, now: Date): Promise<boolean> {
    return this.repo.hasDueNotices(orgId, now, new Date(now.getTime() + ENDING_SOON_MS));
  }

  async expireDue(orgId: string, now: Date): Promise<void> {
    const until = new Date(now.getTime() + ENDING_SOON_MS);
    const appended = await this.uow.run(async ({ entitlements, outbox }) => {
      const events: NewDomainEvent[] = [];
      for (const grant of await entitlements.listGrantsExpiredBy(orgId, now)) {
        if (!grant.expiresAt) {
          continue;
        }
        const claimed = await entitlements.claimNotice(
          orgId,
          { kind: 'expired', entitlementId: grant.id, expiresAt: grant.expiresAt },
          now,
        );
        if (claimed) {
          events.push(entitlementEvents.entitlementExpired.make({ orgId, data: grant }));
        }
      }
      for (const { grant, communityId } of await entitlements.listGrantsEndingBetween(
        orgId,
        now,
        until,
      )) {
        if (!grant.expiresAt) {
          continue;
        }
        const claimed = await entitlements.claimNotice(
          orgId,
          { kind: 'ending_soon', entitlementId: grant.id, communityId, expiresAt: grant.expiresAt },
          now,
        );
        if (claimed) {
          events.push(
            entitlementEvents.entitlementEndingSoon.make({
              orgId,
              data: { ...grant, communityId },
            }),
          );
        }
      }
      if (events.length > 0) {
        await outbox.append(events);
      }
      return events.length;
    });
    if (appended > 0) {
      this.logger.info('due grants expired', { orgId, events: appended });
    }
  }

  private async requireSpaceIn(orgId: string, communityId: string, spaceId: string) {
    const space = await this.content.getSpace(orgId, spaceId);
    if (!space || space.communityId !== communityId) {
      throw new NotFoundError('Space', spaceId);
    }
    return space;
  }

  private assertHasMembers(accessRule: SpaceAccessRule): void {
    if (accessRule === 'all_members') {
      throw new ConflictError('An all-members space has no space members');
    }
  }

  private assertRule(accessRule: SpaceAccessRule, expected: 'by_request' | 'by_invite'): void {
    this.assertHasMembers(accessRule);
    if (accessRule !== expected) {
      throw new ConflictError(
        accessRule === 'by_invite' ? 'This space is by invitation' : 'This space is by request',
      );
    }
  }

  private assertHolder(actor: Actor): void {
    if (isStaffRole(actor.role)) {
      throw new ForbiddenError('Staff do not hold a place in a space');
    }
  }

  private async assertGrant(
    orgId: string,
    actor: Actor,
    orgUserId: string,
    communityId: string,
  ): Promise<void> {
    const member = await this.repo.hasCommunityAccess(orgId, orgUserId, communityId);
    if (!member) {
      throw new ForbiddenError(
        orgUserId === actor.id
          ? 'You are not a member of this community'
          : 'That person is not a member of this community',
      );
    }
  }

  private async assertHolds(
    orgId: string,
    actor: Actor,
    orgUserId: string,
    communityId: string,
  ): Promise<void> {
    const facts = await this.accessOf(orgId, orgUserId, communityId, null);
    if (facts && isStaffRole(facts.role)) {
      throw new ForbiddenError('Staff do not hold a place in a space');
    }
    await this.assertGrant(orgId, actor, orgUserId, communityId);
  }

  private async assertCanManage(orgId: string, actor: Actor, communityId: string): Promise<void> {
    const facts = await this.accessOf(orgId, actor.id, communityId, null);
    if (facts?.member && canModerate(facts.role)) {
      return;
    }
    throw new ForbiddenError('You cannot manage members of this space');
  }

  private async accessOf(
    orgId: string,
    orgUserId: string,
    communityId: string,
    spaceId: string | null,
  ): Promise<AccessFacts | null> {
    const [facts] = await this.repo.accessAmong(orgId, communityId, spaceId, [orgUserId]);
    return facts ?? null;
  }

  private async createMember(
    orgId: string,
    actor: Actor,
    space: { communityId: string; id: string },
    orgUserId: string,
    status: InsertSpaceMemberInput['status'],
    source: InsertSpaceMemberInput['source'],
  ): Promise<SpaceMember> {
    return this.uow.run(async ({ entitlements, outbox }) =>
      this.insertMember(entitlements, outbox, orgId, actor, {
        communityId: space.communityId,
        spaceId: space.id,
        orgUserId,
        status,
        source,
      }),
    );
  }

  private async insertMember(
    entitlements: EntitlementsRepository,
    outbox: OutboxAppender,
    orgId: string,
    actor: Actor,
    input: InsertSpaceMemberInput,
    room?: Space,
  ): Promise<SpaceMember> {
    const existing = await entitlements.lockSpaceMember(orgId, input.spaceId, input.orgUserId);
    if (existing && existing.status !== 'revoked') {
      throw new ConflictError(
        input.orgUserId === actor.id
          ? 'You already have a place in this space'
          : 'That person already has a place in this space',
      );
    }
    if (room) {
      await this.assertRoom(entitlements, orgId, room);
    }
    if (existing) {
      await entitlements.deleteSpaceMember(orgId, existing.id);
    }
    const created = await entitlements.insertSpaceMember(orgId, input);
    await outbox.append([
      entitlementEvents.spaceMemberCreated.make({
        orgId,
        data: created,
        metadata: { actorOrgUserId: actor.id },
      }),
    ]);
    return created;
  }

  private async activate(
    orgId: string,
    actor: Actor,
    spaceId: string,
    orgUserId: string,
    rule: 'by_request' | 'by_invite',
    from: SpaceMember['status'],
    missing: () => Error,
  ): Promise<SpaceMember> {
    const updated = await this.uow.run(async ({ entitlements, spaces, outbox }) => {
      const locked = await this.lockSpace(spaces, orgId, spaceId);
      this.assertRule(locked.accessRule, rule);
      const row = await entitlements.lockSpaceMember(orgId, spaceId, orgUserId);
      if (row?.status === 'active') {
        throw alreadyPlaced(actor, orgUserId);
      }
      if (!row || row.status !== from) {
        throw missing();
      }
      await this.assertRoom(entitlements, orgId, locked);
      const next = await entitlements.updateSpaceMemberStatus(orgId, row.id, 'active');
      if (!next) {
        throw missing();
      }
      await outbox.append([
        entitlementEvents.spaceMemberUpdated.make({
          orgId,
          data: next,
          metadata: { actorOrgUserId: actor.id, previousStatus: from },
        }),
      ]);
      return next;
    });
    this.logger.info('space member activated', { orgId, spaceId, orgUserId });
    return updated;
  }

  private async deleteMember(
    orgId: string,
    actor: Actor,
    spaceId: string,
    orgUserId: string,
    from: SpaceMember['status'],
    missing: () => Error,
  ): Promise<SpaceMember> {
    const row = await this.uow.run(async ({ entitlements, outbox }) => {
      const current = await entitlements.lockSpaceMember(orgId, spaceId, orgUserId);
      if (from !== 'active' && current?.status === 'active') {
        throw alreadyPlaced(actor, orgUserId);
      }
      if (!current || current.status !== from) {
        throw missing();
      }
      await entitlements.deleteSpaceMember(orgId, current.id);
      await outbox.append([
        entitlementEvents.spaceMemberDeleted.make({
          orgId,
          data: current,
          metadata: { actorOrgUserId: actor.id, previousStatus: from },
        }),
      ]);
      return current;
    });
    this.logger.info('space member deleted', {
      orgId,
      spaceId,
      orgUserId,
      previousStatus: from,
    });
    return row;
  }

  private async lockSpace(spaces: SpaceRowLock, orgId: string, spaceId: string) {
    const locked = await spaces.lockSpace(orgId, spaceId);
    if (!locked) {
      throw new NotFoundError('Space', spaceId);
    }
    return locked;
  }

  private async assertRoom(
    entitlements: EntitlementsRepository,
    orgId: string,
    space: Space,
  ): Promise<void> {
    if (space.capacity === null) {
      return;
    }
    const count = await entitlements.countActiveSpaceMembers(orgId, space.id);
    if (count >= space.capacity) {
      throw new ConflictError('This space is full');
    }
  }
}

function alreadyPlaced(actor: Actor, orgUserId: string): ConflictError {
  return new ConflictError(
    orgUserId === actor.id
      ? 'You already have a place in this space'
      : 'That person already has a place in this space',
  );
}

function ownRowMissing(status: 'invited' | 'active'): ConflictError {
  return new ConflictError(
    status === 'invited'
      ? 'You do not have an invitation to this space'
      : 'You are not a member of this space',
  );
}
