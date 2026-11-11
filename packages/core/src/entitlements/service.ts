// entitlements context — service implementation (inbound port).
//
// Mutations run inside the context's UnitOfWork: the domain write and the
// outbox append commit in ONE transaction (transactional outbox). This
// service never publishes — the outbox relay republishes committed events to
// the EventBus at-least-once.
import type { Event, Space, SpaceRowLock } from '../content/index.js';
import type {
  ContentType,
  Entitlement,
  EntitlementsQuery,
  GrantEntitlementInput,
  GrantSource,
  Page,
  SpaceMember,
} from './model.js';
import type {
  AccessFacts,
  EntitlementsRepository,
  EntitlementsService,
  EntitlementsUnitOfWork,
  EndingGrantKey,
  GrantTarget,
  InsertSpaceMemberInput,
  OpenableSpace,
  PermissionHolders,
  RevokeGrantInput,
  SpaceAccessRule,
  ContentReader,
} from './ports.js';
import type { Actor } from '../shared/actor.js';
import type { Logger, NewDomainEvent, OutboxAppender } from '../shared/ports.js';
import { noopLogger } from '../shared/logger.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../shared/errors.js';
import { entitlementEvents } from './events.js';
import { opensSpace, seesSpace } from './rules.js';

const ENDING_SOON_MS = 7 * 24 * 60 * 60 * 1000;
const NOTICE_BATCH_SIZE = 100;

interface CommunityTeam {
  readers: Set<string>;
  moderators: Set<string>;
}

interface Standing {
  member: boolean;
  everySpace: boolean;
  activeInSpace: boolean;
}

export type EntitlementsServiceParams = {
  /** Read-only access (list) — runs outside any transaction. */
  repo: EntitlementsRepository;
  content: ContentReader;
  permissions: PermissionHolders;
  /** Atomic write scope: tx-bound repo + outbox appender. */
  uow: EntitlementsUnitOfWork;
  logger?: Logger;
};

export class EntitlementsServiceImpl implements EntitlementsService {
  private readonly repo: EntitlementsRepository;
  private readonly content: ContentReader;
  private readonly permissions: PermissionHolders;
  private readonly uow: EntitlementsUnitOfWork;
  private readonly logger: Logger;

  constructor(params: EntitlementsServiceParams) {
    this.repo = params.repo;
    this.content = params.content;
    this.permissions = params.permissions;
    this.uow = params.uow;
    this.logger = params.logger ?? noopLogger;
  }

  async list(query: EntitlementsQuery, actor: Actor): Promise<Page<Entitlement>> {
    const orgId = actor.orgId;
    if (!actor.permissions.has('access:read')) {
      const contentId = query.contentId;
      const learners =
        contentId !== undefined &&
        actor.permissions.has('progress:read', contentId) &&
        (await this.repo.contentTypeOf(orgId, contentId)) === 'course';
      if (!learners) {
        this.logger.warn('entitlements list refused', {
          orgId,
          actorId: actor.id,
          contentId: contentId ?? null,
        });
        throw new ForbiddenError(
          contentId === undefined
            ? 'You need access:read'
            : 'You need access:read, or progress:read on this course, to see who holds it',
        );
      }
    }
    return this.repo.list(orgId, query);
  }

  async grant(input: GrantEntitlementInput, actor: Actor): Promise<Entitlement> {
    const orgId = actor.orgId;
    const { contentType, ...grant } = input;
    const contentId = grant.contentId ?? null;
    const type = contentId === null ? null : await this.repo.contentTypeOf(orgId, contentId);
    if (contentType !== undefined && type !== contentType) {
      throw new NotFoundError(contentType === 'event' ? 'Event' : 'Content', contentId ?? '');
    }
    if (contentId !== null && type === 'event') {
      return this.grantEvent({ ...grant, contentId }, actor);
    }
    actor.permissions.require('access:write');
    if (contentId !== null && type === null) {
      throw new NotFoundError('Content', contentId);
    }
    const { entitlement, change } = await this.uow.run(async ({ entitlements, outbox }) => {
      const existing = await entitlements.lockGrant(orgId, {
        orgUserId: grant.orgUserId,
        contentId,
        bundleId: grant.bundleId ?? null,
      });
      const held = existing !== null && activeNow(existing, new Date());
      if (held && sameInstant(existing.expiresAt, grant.expiresAt)) {
        return { entitlement: existing, change: 'none' as const };
      }
      const written = await entitlements.insert(orgId, {
        ...grant,
        source: this.sourceOf(actor, grant.orgUserId),
      });
      const event = held
        ? entitlementEvents.entitlementUpdated
        : entitlementEvents.entitlementCreated;
      await outbox.append([
        event.make({ orgId, data: written, metadata: this.actorMetadata(actor) }),
      ]);
      return { entitlement: written, change: held ? ('updated' as const) : ('created' as const) };
    });
    if (change !== 'none') {
      this.logger.info(
        change === 'created' ? 'entitlement granted' : 'entitlement expiry changed',
        {
          orgId,
          entitlementId: entitlement.id,
          orgUserId: entitlement.orgUserId,
          bundleId: entitlement.bundleId,
          contentId: entitlement.contentId,
          source: entitlement.source,
          actorId: actor.id,
        },
      );
    }
    return entitlement;
  }

  async revoke(input: RevokeGrantInput, actor: Actor): Promise<Entitlement> {
    const orgId = actor.orgId;
    const { orgUserId } = input;
    const contentId = input.contentId ?? null;
    const bundleId = input.bundleId ?? null;
    const type = contentId === null ? null : await this.repo.contentTypeOf(orgId, contentId);
    if (input.contentType !== undefined && type !== input.contentType) {
      throw new NotFoundError(input.contentType === 'event' ? 'Event' : 'Content', contentId ?? '');
    }
    if (type === 'event' && contentId !== null) {
      if (orgUserId !== actor.id) {
        this.requireAttendeeManager(actor, contentId);
      }
    } else {
      actor.permissions.require('access:write');
      if (contentId !== null && type === null) {
        throw new NotFoundError('Content', contentId);
      }
    }
    const target = contentId ?? bundleId;
    const revoked = await this.uow.run(async ({ entitlements, outbox }) => {
      const existing = await entitlements.lockGrant(orgId, { orgUserId, contentId, bundleId });
      if (!existing || !activeNow(existing, new Date())) {
        this.logger.warn('entitlement revoke rejected — no direct active grant', {
          orgId,
          orgUserId,
          contentId,
          bundleId,
          actorId: actor.id,
        });
        throw new NotFoundError('Entitlement', `${orgUserId}:${target}`);
      }
      const updated = await entitlements.setStatus(orgId, existing.id, 'revoked');
      if (!updated) {
        throw new NotFoundError('Entitlement', existing.id);
      }
      await outbox.append([
        entitlementEvents.entitlementDeleted.make({
          orgId,
          data: updated,
          metadata: this.actorMetadata(actor),
        }),
      ]);
      return updated;
    });
    this.logger.info('entitlement revoked', {
      orgId,
      entitlementId: revoked.id,
      orgUserId,
      contentId,
      bundleId,
      actorId: actor.id,
    });
    return revoked;
  }

  private async grantEvent(
    input: GrantEntitlementInput & { contentId: string },
    actor: Actor,
  ): Promise<Entitlement> {
    const orgId = actor.orgId;
    const eventId = input.contentId;
    const orgUserId = input.orgUserId;
    const self = orgUserId === actor.id;
    if (!self) {
      this.requireAttendeeManager(actor, eventId);
    }
    const event = await this.content.getEvent(eventId, this.system(orgId));
    const now = new Date();
    if (self) {
      await this.assertCanRegister(event, actor, now);
    } else {
      assertOpenForAttendees(event, now);
    }
    const { entitlement, created } = await this.uow.run(async ({ entitlements, outbox }) => {
      if (event.settings.capacity !== null) {
        await entitlements.lockCapacity(orgId, eventId);
      }
      const existing = await entitlements.lockGrant(orgId, { orgUserId, contentId: eventId });
      if (existing && activeNow(existing, now)) {
        if (self) {
          throw alreadyRegistered();
        }
        return { entitlement: existing, created: false };
      }
      await this.assertPlace(entitlements, orgId, event, orgUserId);
      const inserted = await entitlements.insert(orgId, {
        orgUserId,
        contentId: eventId,
        expiresAt: self ? null : (input.expiresAt ?? null),
        source: this.sourceOf(actor, orgUserId),
      });
      await outbox.append([
        entitlementEvents.entitlementCreated.make({
          orgId,
          data: inserted,
          metadata: this.actorMetadata(actor),
        }),
      ]);
      return { entitlement: inserted, created: true };
    });
    if (created) {
      this.logger.info('entitlement granted', {
        orgId,
        entitlementId: entitlement.id,
        orgUserId,
        contentId: eventId,
        source: entitlement.source,
        actorId: actor.id,
      });
    }
    return entitlement;
  }

  private async assertCanRegister(event: Event, actor: Actor, now: Date): Promise<void> {
    if (event.status !== 'published') {
      throw new NotFoundError('Event', event.id);
    }
    if (await this.repo.hasAccess(actor.orgId, actor.id, event.id)) {
      throw alreadyRegistered();
    }
    if (event.settings.type !== 'public') {
      this.logger.warn('event registration refused — private', {
        orgId: actor.orgId,
        eventId: event.id,
        actorId: actor.id,
      });
      throw new ForbiddenError('This event is private: only its organizers can add attendees');
    }
    if (event.startsAt.getTime() <= now.getTime()) {
      throw new ConflictError('This event has already started', 'started');
    }
  }

  private requireAttendeeManager(actor: Actor, eventId: string): void {
    if (actor.permissions.has('access:write') || actor.permissions.has('events:write', eventId)) {
      return;
    }
    this.logger.warn('event attendees refused — cannot manage', {
      orgId: actor.orgId,
      eventId,
      actorId: actor.id,
    });
    throw new ForbiddenError('You need access:write, or events:write on this event');
  }

  private async assertPlace(
    entitlements: EntitlementsRepository,
    orgId: string,
    event: Event,
    orgUserId: string,
  ): Promise<void> {
    const capacity = event.settings.capacity;
    if (capacity === null) {
      return;
    }
    const attendees = await entitlements.grantedOrgUserIds(orgId, event.id);
    if (attendees.filter((id) => id !== orgUserId).length >= capacity) {
      throw new ConflictError('This event is full', 'full');
    }
  }

  private sourceOf(actor: Actor, orgUserId: string): GrantSource {
    if (actor.id === this.system(actor.orgId).id) {
      return 'automation';
    }
    return orgUserId === actor.id ? 'self' : 'manual';
  }

  private actorMetadata(actor: Actor): { actorId?: string } {
    return actor.id === this.system(actor.orgId).id ? {} : { actorId: actor.id };
  }

  hasAccess(orgId: string, orgUserId: string, contentId: string): Promise<boolean> {
    return this.repo.hasAccess(orgId, orgUserId, contentId);
  }

  listAccessibleContent(orgId: string, orgUserId: string, type?: ContentType): Promise<string[]> {
    return this.repo.listAccessibleContent(orgId, orgUserId, type);
  }

  holdsAnyGrant(orgId: string, orgUserId: string): Promise<boolean> {
    return this.repo.holdsAnyGrant(orgId, orgUserId);
  }

  async opensEverySpace(actor: Actor, communityId: string): Promise<boolean> {
    return (await this.standingOf(actor, communityId, null)).everySpace;
  }

  async isCommunityMember(communityId: string, actor: Actor): Promise<boolean> {
    if (actor.permissions.has('communities:read', communityId)) {
      return true;
    }
    return this.repo.hasCommunityAccess(actor.orgId, actor.id, communityId);
  }

  async canOpenSpace(spaceId: string, actor: Actor): Promise<boolean> {
    const space = await this.content.getSpace(spaceId, this.system(actor.orgId));
    if (!space) {
      return false;
    }
    return this.canOpen(space, actor);
  }

  async canOpen(space: OpenableSpace, actor: Actor): Promise<boolean> {
    const standing = await this.standingOf(actor, space.communityId, space.id);
    return opensSpace(
      standing.member,
      standing.everySpace,
      space.accessRule,
      standing.activeInSpace,
    );
  }

  async spaceStandings(
    communityId: string,
    actor: Actor,
  ): Promise<Record<string, SpaceMember['status']>> {
    if ((await this.standingOf(actor, communityId, null)).everySpace) {
      return {};
    }
    const rows = await this.repo.listSpaceMembersFor(actor.orgId, actor.id, communityId);
    return Object.fromEntries(rows.map((row) => [row.spaceId, row.status]));
  }

  async openSpacesFor(communityId: string, actor: Actor): Promise<Space[]> {
    const orgId = actor.orgId;
    const standing = await this.standingOf(actor, communityId, null);
    if (!standing.member) {
      return [];
    }
    const [spaces, activeIds] = await Promise.all([
      this.content.listSpaces(communityId, this.system(orgId)),
      standing.everySpace
        ? Promise.resolve([])
        : this.repo.activeSpaceIds(orgId, actor.id, communityId),
    ]);
    const active = new Set(activeIds);
    return spaces.filter((space) =>
      opensSpace(true, standing.everySpace, space.accessRule, active.has(space.id)),
    );
  }

  async openSpaceIds(communityId: string, actor: Actor): Promise<string[]> {
    const spaces = await this.openSpacesFor(communityId, actor);
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
    const [facts, team] = await Promise.all([
      this.repo.accessAmong(orgId, communityId, null, orgUserIds),
      this.teamOf(orgId, communityId),
    ]);
    return facts.filter((fact) => standingFrom(fact, team).member).map((fact) => fact.orgUserId);
  }

  async spaceOpenersAmong(orgId: string, spaceId: string, orgUserIds: string[]): Promise<string[]> {
    if (orgUserIds.length === 0) {
      return [];
    }
    const space = await this.content.getSpace(spaceId, this.system(orgId));
    if (!space) {
      return [];
    }
    const [facts, team] = await Promise.all([
      this.repo.accessAmong(orgId, space.communityId, space.id, orgUserIds),
      this.teamOf(orgId, space.communityId),
    ]);
    return facts
      .filter((fact) => {
        const standing = standingFrom(fact, team);
        return opensSpace(
          standing.member,
          standing.everySpace,
          space.accessRule,
          standing.activeInSpace,
        );
      })
      .map((fact) => fact.orgUserId);
  }

  async spaceOpeners(orgId: string, spaceId: string): Promise<string[]> {
    const space = await this.content.getSpace(spaceId, this.system(orgId));
    if (!space) {
      return [];
    }
    const members = await this.communityMemberIds(orgId, space.communityId);
    return this.spaceOpenersAmong(orgId, spaceId, members);
  }

  communitiesOpenedBy(orgId: string, grant: GrantTarget): Promise<string[]> {
    return this.repo.communitiesOpenedBy(orgId, grant);
  }

  async communityModeratorIds(orgId: string, communityId: string): Promise<string[]> {
    const moderators = await this.permissions.holders(orgId, 'communities:moderate', communityId);
    return this.communityMembersAmong(orgId, communityId, moderators);
  }

  communityIdsOpenedFor(orgId: string, orgUserId: string): Promise<string[]> {
    return this.repo.communityIdsOpenedFor(orgId, orgUserId);
  }

  openCommunityIds(actor: Actor): Promise<string[]> {
    const readable = actor.permissions.where('communities:read');
    return this.repo.openCommunityIds(actor.orgId, actor.id, {
      all: readable.org,
      ids: readable.content,
    });
  }

  async communityMemberIds(orgId: string, communityId: string): Promise<string[]> {
    const readers = await this.permissions.holders(orgId, 'communities:read', communityId);
    return this.repo.communityMemberIds(orgId, communityId, readers);
  }

  grantedOrgUserIds(orgId: string, contentId: string): Promise<string[]> {
    return this.repo.grantedOrgUserIds(orgId, contentId);
  }

  async countActiveSpaceMembers(orgId: string, spaceId: string): Promise<number> {
    const space = await this.content.getSpace(spaceId, this.system(orgId));
    if (!space) {
      return 0;
    }
    const excluding = await this.everySpaceOpeners(orgId, space.communityId);
    return this.repo.countActiveSpaceMembers(orgId, spaceId, excluding);
  }

  async everySpaceOpeners(orgId: string, communityId: string): Promise<string[]> {
    const team = await this.teamOf(orgId, communityId);
    const moderators = [...team.moderators].filter((id) => !team.readers.has(id));
    const granted =
      moderators.length === 0
        ? []
        : (await this.repo.accessAmong(orgId, communityId, null, moderators))
            .filter((fact) => fact.granted)
            .map((fact) => fact.orgUserId);
    return [...team.readers, ...granted];
  }

  async requestJoin(communityId: string, spaceId: string, actor: Actor): Promise<SpaceMember> {
    const orgId = actor.orgId;
    const space = await this.requireVisibleSpaceIn(actor, communityId, spaceId);
    this.assertRule(space.accessRule, 'by_request');
    await this.assertHolder(actor, space.communityId);
    await this.assertMember(actor, actor.id, space.communityId);
    const created = await this.createMember(orgId, actor, space, actor.id, 'requested', 'request');
    this.logger.info('space member created', {
      orgId,
      spaceId,
      orgUserId: actor.id,
      status: created.status,
      actorId: actor.id,
    });
    return created;
  }

  async invite(
    communityId: string,
    spaceId: string,
    orgUserId: string,
    actor: Actor,
  ): Promise<SpaceMember> {
    const orgId = actor.orgId;
    const space = await this.requireVisibleSpaceIn(actor, communityId, spaceId);
    await this.assertCanManage(actor, space.communityId);
    this.assertRule(space.accessRule, 'by_invite');
    await this.assertHolds(actor, orgUserId, space.communityId);
    const created = await this.createMember(orgId, actor, space, orgUserId, 'invited', 'invite');
    this.logger.info('space member created', {
      orgId,
      spaceId,
      orgUserId,
      status: created.status,
      actorId: actor.id,
    });
    return created;
  }

  async addSpaceMember(
    communityId: string,
    spaceId: string,
    orgUserId: string,
    actor: Actor,
  ): Promise<SpaceMember> {
    const orgId = actor.orgId;
    const space = await this.requireVisibleSpaceIn(actor, communityId, spaceId);
    await this.assertCanManage(actor, space.communityId);
    this.assertHasMembers(space.accessRule);
    await this.assertHolds(actor, orgUserId, space.communityId);
    const excluding = await this.everySpaceOpeners(orgId, space.communityId);
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
        { space: locked, excluding },
      );
    });
    this.logger.info('space member created', {
      orgId,
      spaceId,
      orgUserId,
      status: created.status,
      actorId: actor.id,
    });
    return created;
  }

  async accept(communityId: string, spaceId: string, actor: Actor): Promise<SpaceMember> {
    const orgId = actor.orgId;
    const space = await this.requireVisibleSpaceIn(actor, communityId, spaceId);
    this.assertRule(space.accessRule, 'by_invite');
    await this.assertHolder(actor, space.communityId);
    await this.assertMember(actor, actor.id, space.communityId);
    const excluding = await this.everySpaceOpeners(orgId, space.communityId);
    return this.activate(orgId, actor, spaceId, actor.id, 'by_invite', 'invited', excluding, () =>
      ownRowMissing('invited'),
    );
  }

  async approve(
    communityId: string,
    spaceId: string,
    orgUserId: string,
    actor: Actor,
  ): Promise<SpaceMember> {
    const orgId = actor.orgId;
    const space = await this.requireVisibleSpaceIn(actor, communityId, spaceId);
    await this.assertCanManage(actor, space.communityId);
    this.assertRule(space.accessRule, 'by_request');
    await this.assertHolds(actor, orgUserId, space.communityId);
    const excluding = await this.everySpaceOpeners(orgId, space.communityId);
    return this.activate(
      orgId,
      actor,
      spaceId,
      orgUserId,
      'by_request',
      'requested',
      excluding,
      () => new NotFoundError('Space member', orgUserId),
    );
  }

  async decline(
    communityId: string,
    spaceId: string,
    orgUserId: string,
    actor: Actor,
  ): Promise<SpaceMember> {
    const space = await this.requireVisibleSpaceIn(actor, communityId, spaceId);
    await this.assertCanManage(actor, space.communityId);
    return this.deleteMember(
      actor.orgId,
      actor,
      spaceId,
      orgUserId,
      'requested',
      () => new NotFoundError('Space member', orgUserId),
    );
  }

  async refuse(communityId: string, spaceId: string, actor: Actor): Promise<SpaceMember> {
    const space = await this.requireVisibleSpaceIn(actor, communityId, spaceId);
    await this.assertHolder(actor, space.communityId);
    await this.assertMember(actor, actor.id, space.communityId);
    return this.deleteMember(actor.orgId, actor, spaceId, actor.id, 'invited', () =>
      ownRowMissing('invited'),
    );
  }

  async leave(communityId: string, spaceId: string, actor: Actor): Promise<SpaceMember> {
    const space = await this.requireVisibleSpaceIn(actor, communityId, spaceId);
    await this.assertHolder(actor, space.communityId);
    await this.assertMember(actor, actor.id, space.communityId);
    return this.deleteMember(actor.orgId, actor, spaceId, actor.id, 'active', () =>
      ownRowMissing('active'),
    );
  }

  async remove(
    communityId: string,
    spaceId: string,
    orgUserId: string,
    actor: Actor,
  ): Promise<SpaceMember> {
    const orgId = actor.orgId;
    const space = await this.requireVisibleSpaceIn(actor, communityId, spaceId);
    await this.assertCanManage(actor, space.communityId);
    this.assertHasMembers(space.accessRule);
    const { updated, previousStatus } = await this.uow.run(
      async ({ entitlements, spaces, outbox }) => {
        const locked = await this.lockSpace(spaces, orgId, spaceId);
        this.assertHasMembers(locked.accessRule);
        const row = await entitlements.lockSpaceMember(orgId, spaceId, orgUserId);
        if (!row) {
          this.logger.warn('space member remove rejected — not found', {
            orgId,
            spaceId,
            orgUserId,
            actorId: actor.id,
          });
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
            metadata: { actorId: actor.id, previousStatus: row.status },
          }),
        ]);
        return { updated: next, previousStatus: row.status };
      },
    );
    this.logger.info('space member removed', {
      orgId,
      spaceId,
      orgUserId,
      previousStatus,
      actorId: actor.id,
    });
    return updated;
  }

  async listSpaceMembers(
    communityId: string,
    spaceId: string,
    query: { page: number; pageSize: number },
    actor: Actor,
  ): Promise<Page<SpaceMember>> {
    const orgId = actor.orgId;
    const space = await this.requireVisibleSpaceIn(actor, communityId, spaceId);
    if (!(await this.canOpen(space, actor))) {
      throw new NotFoundError('Space', spaceId);
    }
    const excluding = await this.everySpaceOpeners(orgId, space.communityId);
    return this.repo.listSpaceMembers(orgId, spaceId, {
      ...query,
      excluding,
      ...(actor.permissions.has('communities:moderate', space.communityId)
        ? {}
        : { statuses: ['active'] }),
    });
  }

  async expireDueGrants(now: Date): Promise<void> {
    const orgIds = await this.repo.orgIdsWithDueNotices(
      now,
      new Date(now.getTime() + ENDING_SOON_MS),
    );
    let failed = 0;
    for (const orgId of orgIds) {
      try {
        await this.expireDueIn(orgId, now);
      } catch (err) {
        failed += 1;
        this.logger.error('due grants not expired', { orgId, err });
      }
    }
    if (failed > 0) {
      throw new Error(`due grants of ${failed} orgs could not be expired`);
    }
  }

  private async expireDueIn(orgId: string, now: Date): Promise<void> {
    const until = new Date(now.getTime() + ENDING_SOON_MS);
    let appended = 0;
    let afterId: string | undefined;
    for (;;) {
      const batch = await this.uow.run(async ({ entitlements, outbox }) => {
        const events: NewDomainEvent[] = [];
        const grants = await entitlements.listGrantsExpiredBy(
          orgId,
          now,
          NOTICE_BATCH_SIZE,
          afterId,
        );
        for (const grant of grants) {
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
        if (events.length > 0) {
          await outbox.append(events);
        }
        return { events: events.length, last: grants.at(-1)?.id, size: grants.length };
      });
      appended += batch.events;
      if (batch.size < NOTICE_BATCH_SIZE || batch.last === undefined) {
        break;
      }
      afterId = batch.last;
    }
    let afterKey: EndingGrantKey | undefined;
    for (;;) {
      const batch = await this.uow.run(async ({ entitlements, outbox }) => {
        const events: NewDomainEvent[] = [];
        const ending = await entitlements.listGrantsEndingBetween(
          orgId,
          now,
          until,
          NOTICE_BATCH_SIZE,
          afterKey,
        );
        for (const { grant, communityId } of ending) {
          if (!grant.expiresAt) {
            continue;
          }
          const claimed = await entitlements.claimNotice(
            orgId,
            {
              kind: 'ending_soon',
              entitlementId: grant.id,
              communityId,
              expiresAt: grant.expiresAt,
            },
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
        const last = ending.at(-1);
        return {
          events: events.length,
          last: last && { entitlementId: last.grant.id, communityId: last.communityId },
          size: ending.length,
        };
      });
      appended += batch.events;
      if (batch.size < NOTICE_BATCH_SIZE || batch.last === undefined) {
        break;
      }
      afterKey = batch.last;
    }
    if (appended > 0) {
      this.logger.info('due grants expired', { orgId, events: appended });
    }
  }

  private system(orgId: string): Actor {
    return this.permissions.systemActor(orgId);
  }

  private async teamOf(orgId: string, communityId: string): Promise<CommunityTeam> {
    const [readers, moderators] = await Promise.all([
      this.permissions.holders(orgId, 'communities:read', communityId),
      this.permissions.holders(orgId, 'communities:moderate', communityId),
    ]);
    return { readers: new Set(readers), moderators: new Set(moderators) };
  }

  private async standingOf(
    actor: Actor,
    communityId: string,
    spaceId: string | null,
  ): Promise<Standing> {
    const reads = actor.permissions.has('communities:read', communityId);
    const moderates = actor.permissions.has('communities:moderate', communityId);
    if (reads) {
      return { member: true, everySpace: true, activeInSpace: false };
    }
    const facts = await this.accessOf(actor.orgId, actor.id, communityId, spaceId);
    const member = facts?.granted === true;
    return {
      member,
      everySpace: member && moderates,
      activeInSpace: facts?.activeInSpace === true,
    };
  }

  private async requireSpaceIn(orgId: string, communityId: string, spaceId: string) {
    const space = await this.content.getSpace(spaceId, this.system(orgId));
    if (!space || space.communityId !== communityId) {
      this.logger.warn('space members rejected — space not found', {
        orgId,
        communityId,
        spaceId,
      });
      throw new NotFoundError('Space', spaceId);
    }
    return space;
  }

  private async requireVisibleSpaceIn(actor: Actor, communityId: string, spaceId: string) {
    const orgId = actor.orgId;
    const space = await this.requireSpaceIn(orgId, communityId, spaceId);
    if (seesSpace(false, space.accessRule, undefined)) {
      return space;
    }
    if (await this.opensEverySpace(actor, communityId)) {
      return space;
    }
    const row = await this.repo.findSpaceMember(orgId, spaceId, actor.id);
    if (!seesSpace(false, space.accessRule, row?.status)) {
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

  private async assertHolder(actor: Actor, communityId: string): Promise<void> {
    if (await this.opensEverySpace(actor, communityId)) {
      this.logger.warn('space place refused — opens every space', {
        orgId: actor.orgId,
        communityId,
        actorId: actor.id,
      });
      throw new ForbiddenError('You open every space in this community and hold no place in them');
    }
  }

  private async assertMember(actor: Actor, orgUserId: string, communityId: string): Promise<void> {
    const member =
      orgUserId === actor.id
        ? await this.isCommunityMember(communityId, actor)
        : (await this.communityMembersAmong(actor.orgId, communityId, [orgUserId])).length > 0;
    if (!member) {
      throw new ForbiddenError(
        orgUserId === actor.id
          ? 'You are not a member of this community'
          : 'That person is not a member of this community',
      );
    }
  }

  private async assertHolds(actor: Actor, orgUserId: string, communityId: string): Promise<void> {
    const openers = await this.everySpaceOpeners(actor.orgId, communityId);
    if (openers.includes(orgUserId)) {
      this.logger.warn('space place refused — person opens every space', {
        orgId: actor.orgId,
        communityId,
        orgUserId,
        actorId: actor.id,
      });
      throw new ForbiddenError(
        'That person opens every space in this community and holds no place in them',
      );
    }
    await this.assertMember(actor, orgUserId, communityId);
  }

  private async assertCanManage(actor: Actor, communityId: string): Promise<void> {
    if (
      actor.permissions.has('communities:moderate', communityId) &&
      (await this.isCommunityMember(communityId, actor))
    ) {
      return;
    }
    this.logger.warn('space members refused — cannot manage', {
      orgId: actor.orgId,
      communityId,
      actorId: actor.id,
    });
    throw new ForbiddenError('You need communities:moderate on this community, as its member');
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
    room?: { space: Space; excluding: string[] },
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
      await this.assertRoom(entitlements, orgId, room.space, room.excluding);
    }
    if (existing) {
      await entitlements.deleteSpaceMember(orgId, existing.id);
    }
    const created = await entitlements.insertSpaceMember(orgId, input);
    await outbox.append([
      entitlementEvents.spaceMemberCreated.make({
        orgId,
        data: created,
        metadata: { actorId: actor.id },
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
    excluding: string[],
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
        this.logger.warn('space member activate rejected — not found', {
          orgId,
          spaceId,
          orgUserId,
          actorId: actor.id,
        });
        throw missing();
      }
      await this.assertRoom(entitlements, orgId, locked, excluding);
      const next = await entitlements.updateSpaceMemberStatus(orgId, row.id, 'active');
      if (!next) {
        throw missing();
      }
      await outbox.append([
        entitlementEvents.spaceMemberUpdated.make({
          orgId,
          data: next,
          metadata: { actorId: actor.id, previousStatus: from },
        }),
      ]);
      return next;
    });
    this.logger.info('space member activated', { orgId, spaceId, orgUserId, actorId: actor.id });
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
        this.logger.warn('space member delete rejected — not found', {
          orgId,
          spaceId,
          orgUserId,
          actorId: actor.id,
        });
        throw missing();
      }
      await entitlements.deleteSpaceMember(orgId, current.id);
      await outbox.append([
        entitlementEvents.spaceMemberDeleted.make({
          orgId,
          data: current,
          metadata: { actorId: actor.id, previousStatus: from },
        }),
      ]);
      return current;
    });
    this.logger.info('space member deleted', {
      orgId,
      spaceId,
      orgUserId,
      previousStatus: from,
      actorId: actor.id,
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
    excluding: string[],
  ): Promise<void> {
    if (space.capacity === null) {
      return;
    }
    const count = await entitlements.countActiveSpaceMembers(orgId, space.id, excluding);
    if (count >= space.capacity) {
      throw new ConflictError('This space is full');
    }
  }
}

function alreadyRegistered(): ConflictError {
  return new ConflictError('You are already going to this event', 'already_registered');
}

function sameInstant(a: Date | null, b: Date | null): boolean {
  return a === null || b === null ? a === b : a.getTime() === b.getTime();
}

function activeNow(grant: Entitlement, now: Date): boolean {
  return (
    grant.status === 'active' &&
    (grant.expiresAt === null || grant.expiresAt.getTime() > now.getTime())
  );
}

function assertOpenForAttendees(event: Event, now: Date): void {
  if (event.status !== 'published') {
    throw new ConflictError('This event is not published', 'not_published');
  }
  if (event.endsAt.getTime() <= now.getTime()) {
    throw new ConflictError('This event has ended', 'ended');
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

function standingFrom(fact: AccessFacts, team: CommunityTeam): Standing {
  const reads = team.readers.has(fact.orgUserId);
  const member = reads || fact.granted;
  return {
    member,
    everySpace: reads || (member && team.moderators.has(fact.orgUserId)),
    activeInSpace: fact.activeInSpace,
  };
}
