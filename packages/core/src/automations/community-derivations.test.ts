import { describe, expect, it, vi } from 'vitest';
import { entitlementEvents } from '../entitlements/index.js';
import { organizationEvents } from '../organizations/index.js';
import { discussionEvents } from '../discussion/index.js';
import { executeAction } from './actions.js';
import { COMMUNITY_DERIVATIONS } from './community-derivations.js';
import {
  emptyCommunityMail,
  emptyNotificationDesk,
  emptyScheduledWork,
  type ActionDeps,
} from './community-mail.js';
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
      orgUserPerson: vi.fn(async (_orgId: string, orgUserId: string) => ({
        userId: `usr_${orgUserId}`,
        email: `${orgUserId}@example.com`,
      })),
      contentInfo: vi.fn(),
    },
    credentials: { reveal: vi.fn() },
    webhooks: { send: vi.fn() },
    mail: {
      ...emptyCommunityMail,
      communityTitle: vi.fn(async () => 'Founders'),
      communitiesOpenedBy: vi.fn(async () => ['cmy_1']),
      openSpaceNames: vi.fn(async () => ['Announcements']),
      displayName: vi.fn(async () => 'Ann'),
      memberCommunityTitles: vi.fn(async () => [{ id: 'cmy_1', title: 'Founders' }]),
      space: vi.fn(async () => ({ name: 'Announcements', communityId: 'cmy_1', capacity: 4 })),
    },
    grants: { grant: vi.fn() },
    desk: emptyNotificationDesk,
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

  it('emails everyone who can open the space about a new post, except its author', async () => {
    const event = ready(
      discussionEvents.postPublished.make({
        orgId: 'org-1',
        data: {
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
          status: 'published',
          scheduledAt: null,
          publishedAt: new Date('2026-01-02T00:00:00Z'),
          removedBy: null,
          pinned: false,
          commentsClosed: null,
          reactionsEnabled: null,
          createdAt: new Date('2026-01-01T00:00:00Z'),
          updatedAt: new Date('2026-01-02T00:00:00Z'),
        },
        metadata: { previousStatus: 'draft' },
      }),
    );
    const recipients = await COMMUNITY_DERIVATIONS.newPostInSpace!.derive(
      event,
      deps({
        mail: {
          ...deps().mail,
          spaceOpeners: vi.fn(async () => ['ou_1', 'ou_2', 'ou_3']),
        },
      }),
    );
    expect(recipients?.map((recipient) => recipient.orgUserId)).toEqual(['ou_2', 'ou_3']);
    expect(recipients?.[0]?.params).toEqual(
      expect.objectContaining({ spaceName: 'Announcements', postTitle: 'Hello', postId: 'pst_1' }),
    );
  });

  it('sends no digest', async () => {
    expect(
      await COMMUNITY_DERIVATIONS.digest!.derive(
        { type: 'discussion.digest.due' } as never,
        deps(),
      ),
    ).toEqual([]);
  });

  it('emails a new moderator and ignores every other role change', async () => {
    const moderator = ready(
      organizationEvents.orgUserUpdated.make({
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
      }),
    );
    const student = ready(
      organizationEvents.orgUserUpdated.make({
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
      }),
    );
    expect(await COMMUNITY_DERIVATIONS.youAreNowAModerator!.derive(moderator, deps())).toEqual([
      expect.objectContaining({ orgUserId: 'ou_1' }),
    ]);
    expect(await COMMUNITY_DERIVATIONS.youAreNowAModerator!.derive(student, deps())).toEqual([]);
  });

  it('emails staff only for a requested space member', async () => {
    const requested = ready(
      entitlementEvents.spaceMemberCreated.make({
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
      }),
    );
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
    const published = ready(
      discussionEvents.postPublished.make({
        orgId: 'org-1',
        data: post,
        metadata: { previousStatus: 'pending', actorOrgUserId: 'staff_1' },
      }),
    );
    const drafted = ready(
      discussionEvents.postPublished.make({
        orgId: 'org-1',
        data: post,
        metadata: { previousStatus: 'draft' },
      }),
    );
    expect(await COMMUNITY_DERIVATIONS.yourPostWasPublished!.derive(published, deps())).toEqual([
      expect.objectContaining({ orgUserId: 'ou_1' }),
    ]);
    expect(await COMMUNITY_DERIVATIONS.yourPostWasPublished!.derive(drafted, deps())).toEqual([]);
  });
});

describe('community email audiences', () => {
  const at = new Date('2026-01-01T00:00:00Z');
  const message = {
    orgId: 'org-1',
    id: 'msg_1',
    communityId: 'cmy_1',
    chatId: 'cht_1',
    orgUserId: 'ou_1',
    body: 'Hello there',
    replyToId: null,
    editedAt: null,
    deletedAt: null,
    createdAt: at,
    updatedAt: at,
  };
  const participants = ['ou_1', 'ou_2', 'ou_3'].map((orgUserId) => ({
    orgUserId,
    muted: false,
    mutedUntil: null as Date | null,
    leftAt: null,
  }));
  const post = {
    title: 'Hello',
    body: 'Body',
    spaceId: 'spc_1',
    orgUserId: 'ou_2',
    communityId: 'cmy_1',
  };
  const comment = {
    id: 'cmt_2',
    orgId: 'org-1',
    activityId: null,
    postId: 'pst_1',
    communityId: 'cmy_1',
    parentId: 'cmt_1',
    orgUserId: 'ou_1',
    body: 'A reply',
    status: 'published' as const,
    removedBy: null,
    createdAt: at,
    updatedAt: at,
  };

  function chatDeps(
    status: 'pending' | 'open',
    members: string[],
    people: typeof participants = participants,
  ) {
    const base = deps();
    return deps({
      mail: {
        ...base.mail,
        chat: vi.fn(async () => ({
          communityId: 'cmy_1',
          kind: 'direct' as const,
          status,
          createdBy: 'ou_1',
          participants: people,
        })),
        communityMembersAmong: vi.fn(async (_orgId: string, _communityId: string, ids: string[]) =>
          ids.filter((id) => members.includes(id)),
        ),
      },
    });
  }

  it('sends no new-message email for a message stored while its chat was pending', async () => {
    const sent = (chatStatus: string) =>
      ready(
        discussionEvents.messageSent.make({
          orgId: 'org-1',
          data: message,
          metadata: { actorOrgUserId: 'ou_1', chatStatus },
        }),
      );
    const members = ['ou_2', 'ou_3'];
    expect(
      await COMMUNITY_DERIVATIONS.newMessage!.derive(sent('pending'), chatDeps('open', members)),
    ).toEqual([]);
    expect(
      await COMMUNITY_DERIVATIONS.newMessage!.derive(sent('open'), chatDeps('pending', members)),
    ).toEqual([
      expect.objectContaining({ orgUserId: 'ou_2' }),
      expect.objectContaining({ orgUserId: 'ou_3' }),
    ]);
  });

  it('skips a participant muted until a later time or until unmuted', async () => {
    const event = ready(discussionEvents.messageSent.make({ orgId: 'org-1', data: message }));
    const people = [
      { orgUserId: 'ou_1', muted: false, mutedUntil: null, leftAt: null },
      { orgUserId: 'ou_2', muted: true, mutedUntil: null, leftAt: null },
      { orgUserId: 'ou_3', muted: true, mutedUntil: new Date('2026-01-03T00:00:00Z'), leftAt: null },
      { orgUserId: 'ou_4', muted: true, mutedUntil: new Date('2026-01-01T00:00:00Z'), leftAt: null },
      { orgUserId: 'ou_5', muted: false, mutedUntil: new Date('2026-01-03T00:00:00Z'), leftAt: null },
    ];
    const members = ['ou_2', 'ou_3', 'ou_4', 'ou_5'];
    expect(
      await COMMUNITY_DERIVATIONS.newMessage!.derive(event, chatDeps('open', members, people)),
    ).toEqual([
      expect.objectContaining({ orgUserId: 'ou_4' }),
      expect.objectContaining({ orgUserId: 'ou_5' }),
    ]);
  });

  it('sends message excerpts only to participants still in the community', async () => {
    const event = ready(discussionEvents.messageSent.make({ orgId: 'org-1', data: message }));
    const actionDeps = chatDeps('open', ['ou_3']);
    expect(await COMMUNITY_DERIVATIONS.newMessage!.derive(event, actionDeps)).toEqual([
      expect.objectContaining({ orgUserId: 'ou_3' }),
    ]);
    expect(actionDeps.mail.communityMembersAmong).toHaveBeenCalledWith('org-1', 'cmy_1', [
      'ou_2',
      'ou_3',
    ]);
  });

  it('sends no message request to a recipient no longer in the community', async () => {
    const event = ready(
      discussionEvents.chatCreated.make({
        orgId: 'org-1',
        data: {
          orgId: 'org-1',
          id: 'cht_1',
          communityId: 'cmy_1',
          kind: 'direct',
          status: 'pending',
          createdBy: 'ou_1',
          lockedAt: null,
          lockedBy: null,
          createdAt: at,
          updatedAt: at,
          participantIds: ['ou_1', 'ou_2'],
        },
      }),
    );
    expect(
      await COMMUNITY_DERIVATIONS.messageRequest!.derive(event, chatDeps('pending', [])),
    ).toEqual([]);
    expect(
      await COMMUNITY_DERIVATIONS.messageRequest!.derive(event, chatDeps('pending', ['ou_2'])),
    ).toEqual([expect.objectContaining({ orgUserId: 'ou_2' })]);
  });

  function postDeps(openers: string[]) {
    const base = deps();
    return deps({
      mail: {
        ...base.mail,
        post: vi.fn(async () => post),
        comment: vi.fn(async () => ({ orgUserId: 'ou_3', postId: 'pst_1', body: 'Parent' })),
        followerIds: vi.fn(async () => ['ou_3', 'ou_4']),
        spaceOpenersAmong: vi.fn(async (_orgId: string, _spaceId: string, ids: string[]) =>
          ids.filter((id) => openers.includes(id)),
        ),
      },
    });
  }

  it('sends comment excerpts only to followers who can still open the space', async () => {
    const event = ready(discussionEvents.commentCreated.make({ orgId: 'org-1', data: comment }));
    const actionDeps = postDeps(['ou_2', 'ou_4']);
    expect(await COMMUNITY_DERIVATIONS.newCommentOnPost!.derive(event, actionDeps)).toEqual([
      expect.objectContaining({ orgUserId: 'ou_4' }),
      expect.objectContaining({ orgUserId: 'ou_2' }),
    ]);
    expect(actionDeps.mail.spaceOpenersAmong).toHaveBeenCalledWith('org-1', 'spc_1', [
      'ou_3',
      'ou_4',
      'ou_2',
    ]);
  });

  it('sends no reply email to a parent author who can no longer open the space', async () => {
    const event = ready(discussionEvents.commentCreated.make({ orgId: 'org-1', data: comment }));
    expect(await COMMUNITY_DERIVATIONS.replyToYourComment!.derive(event, postDeps([]))).toEqual([]);
    expect(
      await COMMUNITY_DERIVATIONS.replyToYourComment!.derive(event, postDeps(['ou_3'])),
    ).toEqual([expect.objectContaining({ orgUserId: 'ou_3' })]);
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

describe('executeAction notifications', () => {
  const granted = () =>
    ready(entitlementEvents.entitlementCreated.make({ orgId: 'org-1', data: ENTITLEMENT }));

  it('emails and adds a notification for each person concerned', async () => {
    const send = vi.fn(async () => {});
    const notify = vi.fn(async () => {});
    const recipients = await executeAction(
      { type: 'notify', input: { kind: 'welcomeToCommunity', communityId: 'cmy_1' } },
      granted(),
      deps({ mailer: { send }, desk: { ...emptyNotificationDesk, notify } }),
    );
    expect(recipients).toEqual(['ou_1']);
    expect(send).toHaveBeenCalledWith('ou_1@example.com', 'welcomeToCommunity', expect.anything());
    expect(notify).toHaveBeenCalledWith('org-1', [
      {
        userId: 'usr_ou_1',
        kind: 'welcomeToCommunity',
        actorOrgUserId: null,
        communityId: 'cmy_1',
        spaceId: null,
        postId: null,
        commentId: null,
        chatId: null,
        messageId: null,
      },
    ]);
  });

  it('sends no email to a person who turned email off', async () => {
    const send = vi.fn(async () => {});
    const notify = vi.fn(async () => {});
    const preferencesFor = vi.fn(async () => ({
      usr_ou_1: { kind: 'welcomeToCommunity' as const, inApp: true, email: false },
    }));
    const recipients = await executeAction(
      { type: 'notify', input: { kind: 'welcomeToCommunity', communityId: 'cmy_1' } },
      granted(),
      deps({ mailer: { send }, desk: { ...emptyNotificationDesk, notify, preferencesFor } }),
    );
    expect(recipients).toEqual(['ou_1']);
    expect(send).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith('org-1', [
      expect.objectContaining({ userId: 'usr_ou_1', kind: 'welcomeToCommunity' }),
    ]);
    expect(preferencesFor).toHaveBeenCalledWith('org-1', ['usr_ou_1'], 'welcomeToCommunity');
  });

  it('adds no notification for a person who turned in-app off', async () => {
    const send = vi.fn(async () => {});
    const notify = vi.fn(async () => {});
    const preferencesFor = vi.fn(async () => ({
      usr_ou_1: { kind: 'welcomeToCommunity' as const, inApp: false, email: true },
    }));
    const recipients = await executeAction(
      { type: 'notify', input: { kind: 'welcomeToCommunity', communityId: 'cmy_1' } },
      granted(),
      deps({ mailer: { send }, desk: { ...emptyNotificationDesk, notify, preferencesFor } }),
    );
    expect(recipients).toEqual(['ou_1']);
    expect(send).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith('org-1', []);
  });

  it('reaches no one who turned both off', async () => {
    const send = vi.fn(async () => {});
    const preferencesFor = vi.fn(async () => ({
      usr_ou_1: { kind: 'welcomeToCommunity' as const, inApp: false, email: false },
    }));
    const recipients = await executeAction(
      { type: 'notify', input: { kind: 'welcomeToCommunity', communityId: 'cmy_1' } },
      granted(),
      deps({ mailer: { send }, desk: { ...emptyNotificationDesk, preferencesFor } }),
    );
    expect(recipients).toEqual([]);
    expect(send).not.toHaveBeenCalled();
  });

  it('refuses a kind that is not a notification', async () => {
    await expect(
      executeAction({ type: 'notify', input: { kind: 'accessGranted' } }, granted(), deps()),
    ).rejects.toThrow('notify: unknown kind "accessGranted"');
  });
});
