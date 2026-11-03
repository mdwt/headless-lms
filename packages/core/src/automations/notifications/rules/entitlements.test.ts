import { describe, expect, it } from 'vitest';
import { entitlementEvents } from '../../../entitlements/index.js';
import type { DomainEvent } from '../../../shared/ports.js';
import type { RecipientList } from '../../../types/index.js';
import { emptyCommunityMail } from '../../community-mail.js';
import type { NotificationReads } from '../../ports.js';
import { NOTIFICATION_TYPES } from '../types.js';
import { ENTITLEMENT_RULES } from './entitlements.js';

const ORG = 'org_1';
const T = new Date('2026-11-01T00:00:00Z');
const NAMES: Record<string, string> = { ou_sarah: 'Sarah', ou_mia: 'Mia', ou_olivia: 'Olivia' };
const TITLES: Record<string, string> = { cmy_1: 'Spring cohort', cmy_2: 'Summer cohort' };

const GRANT = {
  orgId: ORG,
  id: 'ent_1',
  orgUserId: 'ou_sarah',
  bundleId: null,
  contentId: 'crs_1',
  status: 'active' as const,
  source: 'manual',
  grantedAt: T,
  expiresAt: new Date('2026-11-08T00:00:00Z'),
  createdAt: T,
  updatedAt: T,
};

const MEMBER = {
  orgId: ORG,
  id: 'spm_1',
  communityId: 'cmy_1',
  spaceId: 'spc_speaking',
  orgUserId: 'ou_sarah',
  status: 'requested' as const,
  source: 'request' as const,
  createdAt: T,
  updatedAt: T,
};

type World = {
  opened?: string[];
  held?: string[];
  lost?: string[];
  capacity?: number | null;
  openers?: string[];
};

function fakeReads(world: World = {}): NotificationReads {
  return {
    ...emptyCommunityMail,
    threadParticipants: async () => [],
    mutedAmong: async (_o, _i, ids) => ids,
    communityMembers: async () => [],
    switchedOn: async () => [],
    courseHolders: async () => [],
    contentLostBy: async () => world.lost ?? ['crs_1'],
    activity: async () => null,
    emailOf: async () => null,
    message: async () => null,
    postsPublished: async () => [],
    unreadInChat: async () => ({ count: 0, latest: null }),
    displayName: async (_o, id) => NAMES[id] ?? 'A member',
    userIdsOf: async (_o, ids) =>
      Object.fromEntries(ids.filter((id) => NAMES[id]).map((id) => [id, `usr_${id.slice(3)}`])),
    space: async () => ({
      name: 'Speaking partners',
      communityId: 'cmy_1',
      capacity: world.capacity === undefined ? 5 : world.capacity,
    }),
    activeMemberCount: async () => 2,
    moderationAudience: async () => ['ou_mia', 'ou_olivia', 'ou_sarah'],
    spaceOpenersAmong: async (_o, _s, ids) =>
      ids.filter((id) => (world.openers ?? ['ou_mia', 'ou_olivia']).includes(id)),
    communitiesOpenedBy: async () => world.opened ?? [],
    memberCommunityTitles: async () =>
      (world.held ?? []).map((id) => ({ id, title: TITLES[id] ?? '' })),
    communityTitle: async (_o, id) => TITLES[id] ?? null,
    openSpaceNames: async (_o, _u, communityId) =>
      communityId === 'cmy_1' ? ['Announcements', 'Practice'] : ['Lobby'],
    contentInfo: async (_o, item) =>
      'bundleId' in item
        ? { title: 'All access', type: 'bundle' }
        : { title: 'Spanish in 90 Days', type: 'course' },
  };
}

function ready(
  made: { type: string; version: number; orgId: string; data: unknown },
  metadata?: DomainEvent['metadata'],
): DomainEvent {
  return {
    id: 'evt_1',
    occurredAt: '2026-11-03T09:00:00.000Z',
    type: made.type,
    version: made.version,
    orgId: made.orgId,
    data: made.data,
    ...(metadata ? { metadata } : {}),
  };
}

async function run(event: DomainEvent, world: World = {}) {
  const lists = await ENTITLEMENT_RULES[event.type]!(event, fakeReads(world));
  for (const list of lists) {
    const declared = NOTIFICATION_TYPES.find((type) => type.type === list.type);
    expect(declared?.scopes, list.type).toContain(list.scope);
    expect(Object.keys(list.display).sort(), list.type).toEqual(
      [...(declared?.display[list.scope] ?? [])].sort(),
    );
  }
  return lists;
}

function people(list: RecipientList | undefined) {
  return Object.fromEntries((list?.recipients ?? []).map((r) => [r.orgUserId, r.reasons]));
}

describe('entitlement.space_member.created', () => {
  const created = (status: string, metadata: DomainEvent['metadata']) =>
    ready(
      entitlementEvents.spaceMemberCreated.make({
        orgId: ORG,
        data: { ...MEMBER, status: status as 'requested' },
      }),
      metadata,
    );

  it('asks the moderators to review a join request, never the person requesting', async () => {
    const lists = await run(created('requested', { actorOrgUserId: 'ou_sarah' }));
    expect(lists).toEqual([
      expect.objectContaining({
        type: 'space.join_requested',
        scope: 'space',
        communityId: 'cmy_1',
        spaceId: 'spc_speaking',
        subject: { type: 'space', id: 'spc_speaking' },
        display: { spaceName: 'Speaking partners', memberName: 'Sarah', seatsLeft: '3' },
      }),
    ]);
    expect(people(lists[0])).toEqual({ ou_mia: ['moderator'], ou_olivia: ['moderator'] });
    const uncapped = await run(created('requested', { actorOrgUserId: 'ou_sarah' }), {
      capacity: null,
    });
    expect(uncapped[0]?.display.seatsLeft).toBe('No cap');
  });

  it('tells an invitee who cannot open the space yet', async () => {
    const lists = await run(created('invited', { actorOrgUserId: 'ou_mia' }));
    expect(lists).toEqual([
      expect.objectContaining({
        type: 'space.invited',
        actorOrgUserId: 'ou_mia',
        display: { spaceName: 'Speaking partners', inviterName: 'Mia' },
      }),
    ]);
    expect(people(lists[0])).toEqual({ ou_sarah: ['subject'] });
  });

  it('sends nothing for a member added straight in', async () => {
    expect(await run(created('active', { actorOrgUserId: 'ou_mia' }))).toEqual([]);
  });
});

describe('entitlement.space_member.updated and deleted', () => {
  const updated = (status: string, previousStatus: string) =>
    ready(
      entitlementEvents.spaceMemberUpdated.make({
        orgId: ORG,
        data: { ...MEMBER, status: status as 'active' },
      }),
      { actorOrgUserId: 'ou_mia', previousStatus },
    );

  it('tells the person their request was approved, not when they accept an invite', async () => {
    const lists = await run(updated('active', 'requested'));
    expect(lists[0]).toMatchObject({
      type: 'space.request_approved',
      display: { spaceName: 'Speaking partners' },
    });
    expect(people(lists[0])).toEqual({ ou_sarah: ['subject'] });
    expect(await run(updated('active', 'invited'))).toEqual([]);
  });

  const deleted = (previousStatus: string, actor: string) =>
    ready(entitlementEvents.spaceMemberDeleted.make({ orgId: ORG, data: MEMBER }), {
      actorOrgUserId: actor,
      previousStatus,
    });

  it('tells the person their request was declined, only for a request someone else ended', async () => {
    const lists = await run(deleted('requested', 'ou_mia'));
    expect(lists[0]).toMatchObject({
      type: 'space.request_declined',
      display: { spaceName: 'Speaking partners' },
    });
    expect(people(lists[0])).toEqual({ ou_sarah: ['subject'] });
    expect(await run(deleted('active', 'ou_mia'))).toEqual([]);
    expect(await run(deleted('requested', 'ou_sarah'))).toEqual([]);
  });
});

describe('entitlement.created', () => {
  it('grants access in the org and welcomes the person to each community it opens', async () => {
    const lists = await run(
      ready(entitlementEvents.entitlementCreated.make({ orgId: ORG, data: GRANT })),
      { opened: ['cmy_1'] },
    );
    expect(lists.map((list) => [list.type, list.communityId])).toEqual([
      ['access.granted', null],
      ['community.welcome', 'cmy_1'],
    ]);
    expect(lists[0]).toMatchObject({
      scope: 'org',
      subject: { type: 'course', id: 'crs_1' },
      display: { contentTitle: 'Spanish in 90 Days', contentType: 'course' },
    });
    expect(lists[1]).toMatchObject({
      scope: 'community',
      subject: { type: 'community', id: 'cmy_1' },
      display: { communityTitle: 'Spring cohort', spaceNames: ['Announcements', 'Practice'] },
    });
    for (const list of lists) {
      expect(people(list)).toEqual({ ou_sarah: ['subject'] });
    }
  });

  it('names a bundle grant a bundle and welcomes the person to every community it opens', async () => {
    const lists = await run(
      ready(
        entitlementEvents.entitlementCreated.make({
          orgId: ORG,
          data: { ...GRANT, contentId: null, bundleId: 'bnd_1' },
        }),
      ),
      { opened: ['cmy_1', 'cmy_2'] },
    );
    expect(lists.map((list) => [list.type, list.communityId])).toEqual([
      ['access.granted', null],
      ['community.welcome', 'cmy_1'],
      ['community.welcome', 'cmy_2'],
    ]);
    expect(lists[0]).toMatchObject({
      subject: { type: 'bundle', id: 'bnd_1' },
      display: { contentTitle: 'All access', contentType: 'bundle' },
    });
  });
});

describe('grant endings', () => {
  it('warns a member whose community grant ends soon', async () => {
    const lists = await run(
      ready(
        entitlementEvents.entitlementEndingSoon.make({
          orgId: ORG,
          data: { ...GRANT, contentId: 'cmy_1', communityId: 'cmy_1' },
        }),
      ),
    );
    expect(lists[0]).toMatchObject({
      type: 'community.ending_soon',
      scope: 'community',
      communityId: 'cmy_1',
      display: { communityTitle: 'Spring cohort', expiresAt: '2026-11-08T00:00:00.000Z' },
    });
    expect(people(lists[0])).toEqual({ ou_sarah: ['subject'] });
  });

  it('ends the membership in one list naming every community a deleted grant opened', async () => {
    const lists = await run(
      ready(entitlementEvents.entitlementDeleted.make({ orgId: ORG, data: GRANT })),
      { opened: ['cmy_1', 'cmy_2'] },
    );
    expect(lists).toEqual([
      expect.objectContaining({
        type: 'community.membership_ended',
        scope: 'org',
        communityId: null,
        display: {
          communities: [
            { communityId: 'cmy_1', communityTitle: 'Spring cohort' },
            { communityId: 'cmy_2', communityTitle: 'Summer cohort' },
          ],
        },
      }),
    ]);
  });

  it('names only the communities the person holds through no other grant', async () => {
    const deleted = ready(entitlementEvents.entitlementDeleted.make({ orgId: ORG, data: GRANT }));
    const lists = await run(deleted, { opened: ['cmy_1', 'cmy_2'], held: ['cmy_1'] });
    expect(lists).toEqual([
      expect.objectContaining({
        type: 'community.membership_ended',
        display: { communities: [{ communityId: 'cmy_2', communityTitle: 'Summer cohort' }] },
      }),
    ]);
    const expired = ready(entitlementEvents.entitlementExpired.make({ orgId: ORG, data: GRANT }));
    expect(await run(expired, { opened: ['cmy_1'], held: ['cmy_1'] })).toEqual([]);
  });

  it('says nothing when a deleted grant opened only communities still held through another grant', async () => {
    const bundle = { ...GRANT, contentId: null, bundleId: 'bnd_1' };
    const lists = await run(
      ready(entitlementEvents.entitlementDeleted.make({ orgId: ORG, data: bundle })),
      { opened: ['cmy_1'], held: ['cmy_1'], lost: [] },
    );
    expect(lists).toEqual([]);
  });

  it('revokes access when a deleted bundle opened a course no longer held and a community still held', async () => {
    const bundle = { ...GRANT, contentId: null, bundleId: 'bnd_1' };
    const lists = await run(
      ready(entitlementEvents.entitlementDeleted.make({ orgId: ORG, data: bundle })),
      { opened: ['cmy_1'], held: ['cmy_1'], lost: ['crs_1'] },
    );
    expect(lists).toEqual([
      expect.objectContaining({
        type: 'access.revoked',
        scope: 'org',
        subject: { type: 'bundle', id: 'bnd_1' },
        display: { contentTitle: 'All access' },
      }),
    ]);
    expect(people(lists[0])).toEqual({ ou_sarah: ['subject'] });
  });

  it('says nothing when a deleted course grant leaves the course held through another grant', async () => {
    const lists = await run(
      ready(entitlementEvents.entitlementDeleted.make({ orgId: ORG, data: GRANT })),
      { lost: [] },
    );
    expect(lists).toEqual([]);
  });

  it('ends the membership, not access, when a deleted bundle opened a community no longer held', async () => {
    const bundle = { ...GRANT, contentId: null, bundleId: 'bnd_1' };
    const lists = await run(
      ready(entitlementEvents.entitlementDeleted.make({ orgId: ORG, data: bundle })),
      { opened: ['cmy_1'] },
    );
    expect(lists).toEqual([
      expect.objectContaining({
        type: 'community.membership_ended',
        subject: { type: 'bundle', id: 'bnd_1' },
        display: { communities: [{ communityId: 'cmy_1', communityTitle: 'Spring cohort' }] },
      }),
    ]);
    expect(people(lists[0])).toEqual({ ou_sarah: ['subject'] });
  });

  it('ends the membership in the lost community only, when a deleted bundle opened one still held and one lost', async () => {
    const bundle = { ...GRANT, contentId: null, bundleId: 'bnd_1' };
    const lists = await run(
      ready(entitlementEvents.entitlementDeleted.make({ orgId: ORG, data: bundle })),
      { opened: ['cmy_1', 'cmy_2'], held: ['cmy_1'] },
    );
    expect(lists.map((list) => list.type)).toEqual(['community.membership_ended']);
    expect(lists[0]?.display).toEqual({
      communities: [{ communityId: 'cmy_2', communityTitle: 'Summer cohort' }],
    });
  });

  it('revokes access when a deleted grant opened no community', async () => {
    const lists = await run(
      ready(entitlementEvents.entitlementDeleted.make({ orgId: ORG, data: GRANT })),
    );
    expect(lists).toEqual([
      expect.objectContaining({
        type: 'access.revoked',
        subject: { type: 'course', id: 'crs_1' },
        display: { contentTitle: 'Spanish in 90 Days' },
      }),
    ]);
    expect(people(lists[0])).toEqual({ ou_sarah: ['subject'] });
  });

  it('ends the membership when a grant expires, and says nothing for one without a community', async () => {
    const expired = ready(entitlementEvents.entitlementExpired.make({ orgId: ORG, data: GRANT }));
    expect((await run(expired, { opened: ['cmy_1'] })).map((list) => list.type)).toEqual([
      'community.membership_ended',
    ]);
    expect(await run(expired)).toEqual([]);
  });
});
