// entitlements context — service implementation (inbound port).
//
// Mutations run inside the context's UnitOfWork: the domain write and the
// outbox append commit in ONE transaction (transactional outbox). This
// service never publishes — the outbox relay republishes committed events to
// the EventBus at-least-once.
import type { CommunityReader, SpaceRowLock } from '../content/index.js';
import type {
  Entitlement,
  EntitlementsQuery,
  GrantEntitlementInput,
  Page,
  SpaceMember,
} from './model.js';
import type {
  EntitlementsRepository,
  EntitlementsService,
  EntitlementsUnitOfWork,
  GrantTarget,
  InsertSpaceMemberInput,
} from './ports.js';
import type { Actor } from '../shared/actor.js';
import type { Logger, OutboxAppender } from '../shared/ports.js';
import { noopLogger } from '../shared/logger.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../shared/errors.js';
import { isStaffRole } from '../organizations/index.js';
import { entitlementEvents } from './events.js';

const ENDING_SOON_MS = 7 * 24 * 60 * 60 * 1000;

export type EntitlementsServiceParams = {
  /** Read-only access (list) — runs outside any transaction. */
  repo: EntitlementsRepository;
  /** Spaces, their access rules, and the row lock taken inside a write. */
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
    if (isStaffRole(actor.role)) {
      return true;
    }
    return this.repo.hasCommunityAccess(orgId, actor.id, communityId);
  }

  async canOpenSpace(orgId: string, actor: Actor, spaceId: string): Promise<boolean> {
    const space = await this.content.getSpace(orgId, spaceId);
    if (!space) {
      return false;
    }
    if (isStaffRole(actor.role)) {
      return true;
    }
    const member = await this.repo.hasCommunityAccess(orgId, actor.id, space.communityId);
    if (!member) {
      return false;
    }
    if (actor.role === 'moderator') {
      return true;
    }
    if (space.accessRule === 'all_members') {
      return true;
    }
    const row = await this.repo.findSpaceMember(orgId, spaceId, actor.id);
    return row?.status === 'active';
  }

  async openSpaceIds(orgId: string, actor: Actor, communityId: string): Promise<string[]> {
    const spaces = await this.content.listSpaces(orgId, communityId);
    if (isStaffRole(actor.role)) {
      return spaces.map((space) => space.id);
    }
    const member = await this.repo.hasCommunityAccess(orgId, actor.id, communityId);
    if (!member) {
      return [];
    }
    if (actor.role === 'moderator') {
      return spaces.map((space) => space.id);
    }
    const active = new Set(await this.repo.activeSpaceIds(orgId, actor.id, communityId));
    return spaces
      .filter((space) => space.accessRule === 'all_members' || active.has(space.id))
      .map((space) => space.id);
  }

  grantOpensCommunity(orgId: string, grant: GrantTarget, communityId: string): Promise<boolean> {
    return this.repo.grantOpensCommunity(orgId, grant, communityId);
  }

  async requestJoin(
    orgId: string,
    actor: Actor,
    communityId: string,
    spaceId: string,
  ): Promise<SpaceMember> {
    const space = await this.requireSpaceIn(orgId, communityId, spaceId);
    this.assertHasMembers(space.accessRule);
    if (space.accessRule !== 'by_request') {
      throw new ConflictError('This space is by invitation');
    }
    if (isStaffRole(actor.role) || actor.role === 'moderator') {
      throw new ForbiddenError('You do not request a place in a space');
    }
    await this.assertGrant(orgId, actor.id, space.communityId);
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
    this.assertHasMembers(space.accessRule);
    await this.assertCanManage(orgId, actor, space.communityId);
    await this.assertGrant(orgId, orgUserId, space.communityId);
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
    await this.assertGrant(orgId, orgUserId, space.communityId);
    const created = await this.uow.run(async (scope) => {
      await this.assertCapacity(scope.spaces, scope.entitlements, orgId, spaceId);
      return this.insertMember(scope.entitlements, scope.outbox, orgId, actor, {
        communityId: space.communityId,
        spaceId,
        orgUserId,
        status: 'active',
        source: 'manual',
      });
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
    this.assertHasMembers(space.accessRule);
    await this.assertGrant(orgId, actor.id, space.communityId);
    const row = await this.requireOwnRow(orgId, spaceId, actor.id, 'invited');
    return this.activate(orgId, actor, spaceId, row, 'invited');
  }

  async approve(
    orgId: string,
    actor: Actor,
    communityId: string,
    spaceId: string,
    orgUserId: string,
  ): Promise<SpaceMember> {
    const space = await this.requireSpaceIn(orgId, communityId, spaceId);
    this.assertHasMembers(space.accessRule);
    await this.assertCanManage(orgId, actor, space.communityId);
    const row = await this.requireRow(orgId, spaceId, orgUserId, 'requested');
    return this.activate(orgId, actor, spaceId, row, 'requested');
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
    const row = await this.requireRow(orgId, spaceId, orgUserId, 'requested');
    return this.deleteMember(orgId, actor, row, 'requested');
  }

  async refuse(
    orgId: string,
    actor: Actor,
    communityId: string,
    spaceId: string,
  ): Promise<SpaceMember> {
    await this.requireSpaceIn(orgId, communityId, spaceId);
    this.assertHolder(actor);
    const row = await this.requireOwnRow(orgId, spaceId, actor.id, 'invited');
    return this.deleteMember(orgId, actor, row, 'invited');
  }

  async leave(
    orgId: string,
    actor: Actor,
    communityId: string,
    spaceId: string,
  ): Promise<SpaceMember> {
    await this.requireSpaceIn(orgId, communityId, spaceId);
    this.assertHolder(actor);
    const row = await this.requireOwnRow(orgId, spaceId, actor.id, 'active');
    return this.deleteMember(orgId, actor, row, 'active');
  }

  async remove(
    orgId: string,
    actor: Actor,
    communityId: string,
    spaceId: string,
    orgUserId: string,
  ): Promise<SpaceMember> {
    const space = await this.requireSpaceIn(orgId, communityId, spaceId);
    await this.assertCanManage(orgId, actor, space.communityId);
    const row = await this.repo.findSpaceMember(orgId, spaceId, orgUserId);
    if (!row) {
      throw new NotFoundError('Space member', orgUserId);
    }
    if (row.status === 'revoked') {
      throw new ConflictError('This person is already removed from the space');
    }
    const previousStatus = row.status;
    const updated = await this.uow.run(async ({ entitlements, outbox }) => {
      const next = await entitlements.updateSpaceMemberStatus(orgId, row.id, 'revoked');
      if (!next) {
        throw new NotFoundError('Space member', row.id);
      }
      await outbox.append([
        entitlementEvents.spaceMemberUpdated.make({
          orgId,
          data: next,
          metadata: { actorOrgUserId: actor.id, previousStatus },
        }),
      ]);
      return next;
    });
    this.logger.info('space member removed', { orgId, spaceId, orgUserId, previousStatus });
    return updated;
  }

  async listSpaceMembers(
    orgId: string,
    actor: Actor,
    communityId: string,
    spaceId: string,
  ): Promise<SpaceMember[]> {
    await this.requireSpaceIn(orgId, communityId, spaceId);
    const open = await this.canOpenSpace(orgId, actor, spaceId);
    if (!open) {
      throw new ForbiddenError('You cannot open this space');
    }
    const rows = await this.repo.listSpaceMembers(orgId, spaceId);
    if (isStaffRole(actor.role) || actor.role === 'moderator') {
      return rows;
    }
    return rows.filter((row) => row.status === 'active');
  }

  async expireDue(orgId: string, now: Date): Promise<void> {
    const until = new Date(now.getTime() + ENDING_SOON_MS);
    const appended = await this.uow.run(async ({ entitlements, outbox }) => {
      const events = [];
      const expired = await entitlements.listGrantsExpiredBy(orgId, now);
      for (const grant of expired) {
        const seen = await entitlements.outboxHas(orgId, 'entitlement.expired', grant.id);
        if (seen) {
          continue;
        }
        events.push(entitlementEvents.entitlementExpired.make({ orgId, data: grant }));
      }
      const ending = await entitlements.listGrantsEndingBetween(orgId, now, until);
      for (const grant of ending) {
        const communities = await entitlements.communitiesOpenedBy(orgId, grant);
        for (const communityId of communities) {
          const seen = await entitlements.outboxHas(
            orgId,
            'entitlement.ending_soon',
            grant.id,
            communityId,
          );
          if (seen) {
            continue;
          }
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

  private async requireSpace(orgId: string, spaceId: string) {
    const space = await this.content.getSpace(orgId, spaceId);
    if (!space) {
      throw new NotFoundError('Space', spaceId);
    }
    return space;
  }

  private async requireSpaceIn(orgId: string, communityId: string, spaceId: string) {
    const space = await this.requireSpace(orgId, spaceId);
    if (space.communityId !== communityId) {
      throw new NotFoundError('Space', spaceId);
    }
    return space;
  }

  private assertHasMembers(accessRule: 'all_members' | 'by_request' | 'by_invite'): void {
    if (accessRule === 'all_members') {
      throw new ConflictError('An all-members space has no space members');
    }
  }

  private assertHolder(actor: Actor): void {
    if (isStaffRole(actor.role)) {
      throw new ForbiddenError('Staff do not hold a place in a space');
    }
  }

  private async assertGrant(orgId: string, orgUserId: string, communityId: string): Promise<void> {
    const member = await this.repo.hasCommunityAccess(orgId, orgUserId, communityId);
    if (!member) {
      throw new ForbiddenError('You are not a member of this community');
    }
  }

  private async assertCanManage(orgId: string, actor: Actor, communityId: string): Promise<void> {
    if (isStaffRole(actor.role)) {
      return;
    }
    if (
      actor.role === 'moderator' &&
      (await this.repo.hasCommunityAccess(orgId, actor.id, communityId))
    ) {
      return;
    }
    throw new ForbiddenError('You cannot manage members of this space');
  }

  private async requireRow(
    orgId: string,
    spaceId: string,
    orgUserId: string,
    status: SpaceMember['status'],
  ): Promise<SpaceMember> {
    const row = await this.repo.findSpaceMember(orgId, spaceId, orgUserId);
    if (!row || row.status !== status) {
      throw new NotFoundError('Space member', orgUserId);
    }
    return row;
  }

  private async requireOwnRow(
    orgId: string,
    spaceId: string,
    orgUserId: string,
    status: SpaceMember['status'],
  ): Promise<SpaceMember> {
    const row = await this.repo.findSpaceMember(orgId, spaceId, orgUserId);
    if (!row || row.status !== status) {
      throw new ConflictError(
        status === 'invited'
          ? 'You do not have an invitation to this space'
          : 'You are not a member of this space',
      );
    }
    return row;
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
  ): Promise<SpaceMember> {
    const existing = await entitlements.findSpaceMember(orgId, input.spaceId, input.orgUserId);
    if (existing && existing.status !== 'revoked') {
      throw new ConflictError(
        input.orgUserId === actor.id
          ? 'You already have a place in this space'
          : 'That person already has a place in this space',
      );
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
    row: SpaceMember,
    previousStatus: SpaceMember['status'],
  ): Promise<SpaceMember> {
    const updated = await this.uow.run(async ({ entitlements, spaces, outbox }) => {
      await this.assertCapacity(spaces, entitlements, orgId, spaceId);
      const next = await entitlements.updateSpaceMemberStatus(orgId, row.id, 'active');
      if (!next) {
        throw new NotFoundError('Space member', row.id);
      }
      await outbox.append([
        entitlementEvents.spaceMemberUpdated.make({
          orgId,
          data: next,
          metadata: { actorOrgUserId: actor.id, previousStatus },
        }),
      ]);
      return next;
    });
    this.logger.info('space member activated', { orgId, spaceId, orgUserId: row.orgUserId });
    return updated;
  }

  private async deleteMember(
    orgId: string,
    actor: Actor,
    row: SpaceMember,
    previousStatus: SpaceMember['status'],
  ): Promise<SpaceMember> {
    await this.uow.run(async ({ entitlements, outbox }) => {
      await entitlements.deleteSpaceMember(orgId, row.id);
      await outbox.append([
        entitlementEvents.spaceMemberDeleted.make({
          orgId,
          data: row,
          metadata: { actorOrgUserId: actor.id, previousStatus },
        }),
      ]);
    });
    this.logger.info('space member deleted', {
      orgId,
      spaceId: row.spaceId,
      orgUserId: row.orgUserId,
      previousStatus,
    });
    return row;
  }

  private async assertCapacity(
    spaces: SpaceRowLock,
    entitlements: EntitlementsRepository,
    orgId: string,
    spaceId: string,
  ): Promise<void> {
    const locked = await spaces.lockSpace(orgId, spaceId);
    if (!locked) {
      throw new NotFoundError('Space', spaceId);
    }
    if (locked.accessRule === 'all_members') {
      throw new ConflictError('An all-members space has no space members');
    }
    if (locked.capacity !== null) {
      const count = await entitlements.countActiveSpaceMembers(orgId, spaceId);
      if (count >= locked.capacity) {
        throw new ConflictError('This space is full');
      }
    }
  }
}
