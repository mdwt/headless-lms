import { describe, expect, it, vi } from 'vitest';
import { entitlementEvents } from '../entitlements/index.js';
import { organizationEvents } from '../organizations/index.js';
import { discussionEvents } from '../discussion/index.js';
import { executeAction } from './actions.js';
import { COMMUNITY_DERIVATIONS } from './community-derivations.js';
import { emptyCommunityMail, emptyScheduledWork, type ActionDeps } from './community-mail.js';
import type { DomainEvent } from '../shared/ports.js';

function ready(event: {
  type: string;
  version: number;
  orgId: string;
  data: unknown;
  metadata?: DomainEvent['metadata'];
}): DomainEvent {
  return {
    id: 'evt_1',
    occurredAt: '2026-01-02T00:00:00.000Z',
    type: event.type,
    version: event.version,
    orgId: event.orgId,
    data: event.data,
    ...(event.metadata ? { metadata: event.metadata } : {}),
  };
}

function deps(over: Partial<ActionDeps> = {}): ActionDeps {
  return {
    mailer: { send: vi.fn() },
    lookups: {
      orgUserEmail: vi.fn(async (_orgId: string, orgUserId: string) => `${orgUserId}@example.com`),
      contentInfo: vi.fn(),
    },
    credentials: { reveal: vi.fn() },
    webhooks: { send: vi.fn() },
    mail: {
      ...emptyCommunityMail,
      communityTitle: vi.fn(async () => 'Founders'),
      grantOpensCommunity: vi.fn(async () => true),
      communitiesOpenedBy: vi.fn(async () => ['cmy_1']),
      openSpaceNames: vi.fn(async () => ['Announcements']),
      displayName: vi.fn(async () => 'Ann'),
      memberCommunityTitles: vi.fn(async () => [{ id: 'cmy_1', title: 'Founders' }]),
      space: vi.fn(async () => ({ name: 'Announcements', communityId: 'cmy_1', capacity: 4 })),
    },
    grants: { grant: vi.fn() },
    scheduledWork: emptyScheduledWork,
    automationId: 'atm_1',
    actionInput: { template: 'welcomeToCommunity', communityId: 'cmy_1' },
    ...over,
  };
}

const ENTITLEMENT = {
  orgId: 'org-1',
  id: 'ent_1',
  orgUserId: 'ou_1',
  bundleId: null,
  contentId: 'cmy_1',
  status: 'active' as const,
  source: 'manual',
  grantedAt: new Date('2026-01-01T00:00:00Z'),
  expiresAt: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

describe('community email derivations', () => {
  it('welcomes the member when the grant opens the community', async () => {
    const event = ready(
      entitlementEvents.entitlementCreated.make({ orgId: 'org-1', data: ENTITLEMENT }),
    );
    const recipients = await COMMUNITY_DERIVATIONS.welcomeToCommunity!.derive(event, deps());
    expect(recipients).toEqual([
      expect.objectContaining({
        orgUserId: 'ou_1',
        to: 'ou_1@example.com',
        params: expect.objectContaining({
          communityTitle: 'Founders',
          spaceNames: ['Announcements'],
        }),
      }),
    ]);
  });

  it('sends nothing when the grant does not open the community', async () => {
    const event = ready(
      entitlementEvents.entitlementCreated.make({ orgId: 'org-1', data: ENTITLEMENT }),
    );
    const mail = deps().mail;
    const recipients = await COMMUNITY_DERIVATIONS.welcomeToCommunity!.derive(
      event,
      deps({ mail: { ...mail, communitiesOpenedBy: vi.fn(async () => []) } }),
    );
    expect(recipients).toEqual([]);
  });

  it('does not send a new-post email until preferences exist', async () => {
    expect(
      await COMMUNITY_DERIVATIONS.newPostInSpace!.derive(
        { type: 'discussion.post.published' } as never,
        deps(),
      ),
    ).toEqual([]);
    expect(
      await COMMUNITY_DERIVATIONS.digest!.derive(
        { type: 'discussion.digest.due' } as never,
        deps(),
      ),
    ).toEqual([]);
  });

  it('emails a new moderator and ignores every other role change', async () => {
    const moderator = ready(organizationEvents.orgUserUpdated.make({
      orgId: 'org-1',
      data: {
        id: 'ou_1',
        orgId: 'org-1',
        userId: 'usr_1',
        role: 'moderator',
        status: 'active',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      },
    }));
    const student = ready(organizationEvents.orgUserUpdated.make({
      orgId: 'org-1',
      data: {
        id: 'ou_1',
        orgId: 'org-1',
        userId: 'usr_1',
        role: 'student',
        status: 'active',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      },
    }));
    expect(await COMMUNITY_DERIVATIONS.youAreNowAModerator!.derive(moderator, deps())).toEqual([
      expect.objectContaining({ orgUserId: 'ou_1' }),
    ]);
    expect(await COMMUNITY_DERIVATIONS.youAreNowAModerator!.derive(student, deps())).toEqual([]);
  });

  it('emails staff only for a requested space member', async () => {
    const requested = ready(entitlementEvents.spaceMemberCreated.make({
      orgId: 'org-1',
      data: {
        orgId: 'org-1',
        id: 'spm_1',
        communityId: 'cmy_1',
        spaceId: 'spc_1',
        orgUserId: 'ou_1',
        status: 'requested',
        source: 'request',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      },
    }));
    const active = ready(
      entitlementEvents.spaceMemberCreated.make({
        orgId: 'org-1',
        data: {
          orgId: 'org-1',
          id: 'spm_1',
          communityId: 'cmy_1',
          spaceId: 'spc_1',
          orgUserId: 'ou_1',
          status: 'active',
          source: 'manual',
          createdAt: new Date('2026-01-01T00:00:00Z'),
          updatedAt: new Date('2026-01-01T00:00:00Z'),
        },
      }),
    );
    const audience = deps({
      mail: {
        ...deps().mail,
        moderationAudience: vi.fn(async () => ['staff_1']),
        activeMemberCount: vi.fn(async () => 1),
      },
    });
    const sent = await COMMUNITY_DERIVATIONS.joinRequest!.derive(requested, audience);
    expect(sent).toEqual([
      expect.objectContaining({
        orgUserId: 'staff_1',
        params: expect.objectContaining({ seatsLeft: '3' }),
      }),
    ]);
    expect(await COMMUNITY_DERIVATIONS.joinRequest!.derive(active, audience)).toEqual([]);
  });

  it('emails the author only when a pending post is published', async () => {
    const post = {
      orgId: 'org-1',
      id: 'pst_1',
      communityId: 'cmy_1',
      spaceId: 'spc_1',
      orgUserId: 'ou_1',
      topicId: null,
      title: 'Hello',
      body: 'Body',
      extra: null,
      coverAssetId: null,
      status: 'published' as const,
      scheduledAt: null,
      publishedAt: new Date('2026-01-02T00:00:00Z'),
      removedBy: null,
      pinned: false,
      commentsClosed: null,
      reactionsEnabled: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-02T00:00:00Z'),
    };
    const published = ready(discussionEvents.postPublished.make({
      orgId: 'org-1',
      data: post,
      metadata: { previousStatus: 'pending', actorOrgUserId: 'staff_1' },
    }));
    const drafted = ready(discussionEvents.postPublished.make({
      orgId: 'org-1',
      data: post,
      metadata: { previousStatus: 'draft' },
    }));
    expect(await COMMUNITY_DERIVATIONS.yourPostWasPublished!.derive(published, deps())).toEqual([
      expect.objectContaining({ orgUserId: 'ou_1' }),
    ]);
    expect(await COMMUNITY_DERIVATIONS.yourPostWasPublished!.derive(drafted, deps())).toEqual([]);
  });
});

describe('executeAction grant and schedule', () => {
  it('grants the community to a new student', async () => {
    const grant = vi.fn(async () => ({}));
    const actionDeps = deps({ grants: { grant } });
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-02T00:00:00Z'));
    const recipients = await executeAction(
      { type: 'grantAccess', input: { contentId: 'cmy_1', expiresInDays: 7 } },
      {
        type: 'organization.student.created',
        id: 'evt_1',
        orgId: 'org-1',
        version: 1,
        occurredAt: '2026-01-02T00:00:00.000Z',
        data: { id: 'ou_1' },
      },
      actionDeps,
    );
    vi.useRealTimers();
    expect(recipients).toEqual([]);
    expect(grant).toHaveBeenCalledWith('org-1', {
      orgUserId: 'ou_1',
      contentId: 'cmy_1',
      bundleId: null,
      expiresAt: new Date('2026-01-09T00:00:00.000Z'),
    });
  });

  it('publishes due posts from the schedule clock', async () => {
    const publishDuePosts = vi.fn(async () => {});
    await executeAction(
      { type: 'publishDuePosts', input: {} },
      {
        type: 'automation.schedule.fired',
        id: 'schedule_atm_1_2026-01-02T00:00:00.000Z',
        orgId: 'org-1',
        version: 1,
        occurredAt: '2026-01-02T00:00:00.000Z',
        data: { automationId: 'atm_1', firedAt: '2026-01-02T00:05:00.000Z' },
      },
      deps({ scheduledWork: { ...emptyScheduledWork, publishDuePosts } }),
    );
    expect(publishDuePosts).toHaveBeenCalledWith('org-1', new Date('2026-01-02T00:05:00.000Z'));
  });
});
