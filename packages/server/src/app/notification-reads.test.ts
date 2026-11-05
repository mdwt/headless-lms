import { describe, expect, it, vi } from 'vitest';
import type { OrgUser } from '@headless-lms/core/types';
import { notificationReads, type NotificationReadsDeps } from './notification-reads.js';

const reject = async (): Promise<never> => {
  throw new Error('not expected');
};

function deps(over: Partial<NotificationReadsDeps> = {}): NotificationReadsDeps {
  return {
    content: {
      getCommunity: reject,
      getSpace: reject,
      listCommunitiesById: reject,
      getActivity: reject,
      getModule: reject,
      getCourse: reject,
      getDownload: reject,
      getBundle: reject,
      listBundleItems: reject,
    },
    entitlements: {
      openSpacesFor: reject,
      communitiesOpenedBy: reject,
      communityMembersAmong: reject,
      spaceOpenersAmong: reject,
      spaceOpeners: reject,
      countActiveSpaceMembers: reject,
      communityIdsOpenedFor: reject,
      ensureGrant: reject,
      communityMemberIds: reject,
      contentHolderIds: reject,
      hasAccess: reject,
    },
    organizations: {
      getById: reject,
      getOrgUserById: reject,
      actorFor: reject,
      systemActor: (orgId: string) => ({ id: 'system', orgId }) as never,
      holders: reject,
      getRole: reject,
      getOrgUsersByIds: reject,
      permissionsOfMany: reject,
    },
    identity: { displayName: reject, getUserById: reject },
    posts: { find: reject, publishedBetween: reject },
    subscriptions: { followerIds: reject, itemSubscriptions: reject, mutedAmong: reject },
    discussion: { getComment: reject, commenterIds: reject },
    chats: {
      chatSummary: reject,
      latestMessageBody: reject,
      isBlocked: reject,
      unreadInChat: reject,
      findMessage: reject,
    },
    settings: { switchedOn: reject },
    ...over,
  };
}

const base = deps();
const T = new Date('2026-11-01T00:00:00Z');

describe('notificationReads', () => {
  it('reads thread participants of a post or a course activity from discussion', async () => {
    const commenterIds = vi.fn(async () => ['ou_sarah']);
    const reads = notificationReads(deps({ discussion: { ...base.discussion, commenterIds } }));
    await expect(reads.threadParticipants('org_1', { type: 'post', id: 'pst_1' })).resolves.toEqual(
      ['ou_sarah'],
    );
    await reads.threadParticipants('org_1', { type: 'activity', id: 'act_1' });
    await expect(reads.threadParticipants('org_1', { type: 'chat', id: 'cht_1' })).resolves.toEqual(
      [],
    );
    expect(commenterIds.mock.calls).toEqual([
      ['org_1', { postId: 'pst_1' }],
      ['org_1', { activityId: 'act_1' }],
    ]);
  });

  it('passes mutes, members, switched-on members, holders and unread messages through', async () => {
    const mutedAmong = vi.fn(async () => ['ou_emma']);
    const communityMemberIds = vi.fn(async () => ['ou_1']);
    const contentHolderIds = vi.fn(async () => ['ou_2']);
    const switchedOn = vi.fn(async () => ['ou_3']);
    const unreadInChat = vi.fn(async () => ({ count: 2, latest: null }));
    const reads = notificationReads(
      deps({
        subscriptions: { ...base.subscriptions, mutedAmong },
        entitlements: { ...base.entitlements, communityMemberIds, contentHolderIds },
        settings: { switchedOn },
        chats: { ...base.chats, unreadInChat },
      }),
    );
    const at = new Date('2026-11-03T12:00:00Z');
    await expect(
      reads.mutedAmong('org_1', { type: 'space', id: 'spc_1' }, ['ou_emma'], at),
    ).resolves.toEqual(['ou_emma']);
    expect(mutedAmong).toHaveBeenCalledWith(
      'org_1',
      { type: 'space', id: 'spc_1' },
      ['ou_emma'],
      at,
    );
    await expect(reads.communityMembers('org_1', 'cmy_1')).resolves.toEqual(['ou_1']);
    await expect(reads.courseHolders('org_1', 'crs_1')).resolves.toEqual(['ou_2']);
    expect(contentHolderIds).toHaveBeenCalledWith('org_1', 'crs_1');
    await expect(reads.switchedOn('org_1', 'cmy_1', 'new_posts', 'spc_1')).resolves.toEqual([
      'ou_3',
    ]);
    await expect(reads.unreadInChat('org_1', 'cht_1', 'ou_sarah')).resolves.toEqual({
      count: 2,
      latest: null,
    });
  });

  it('names an activity with its module and course', async () => {
    const reads = notificationReads(
      deps({
        content: {
          ...base.content,
          getActivity: async () =>
            ({
              id: 'act_1',
              moduleId: 'mod_1',
              courseId: 'crs_1',
              settings: { title: 'Lesson 3' },
            }) as never,
          getModule: async () => ({ id: 'mod_1', title: 'Week 1' }) as never,
          getCourse: async () => ({ id: 'crs_1', title: 'Spanish in 90 Days' }) as never,
        },
      }),
    );
    await expect(reads.activity('org_1', 'act_1')).resolves.toEqual({
      title: 'Lesson 3',
      moduleTitle: 'Week 1',
      courseId: 'crs_1',
      courseTitle: 'Spanish in 90 Days',
    });
  });

  it('maps org users to people and reads an email address', async () => {
    const reads = notificationReads(
      deps({
        organizations: {
          ...base.organizations,
          getOrgUsersByIds: async () => [{ id: 'ou_sarah', userId: 'usr_sarah' } as OrgUser],
        },
        identity: {
          ...base.identity,
          getUserById: async (id) => (id === 'usr_sarah' ? ({ email: 's@x.test' } as never) : null),
        },
      }),
    );
    await expect(reads.userIdsOf('org_1', ['ou_sarah', 'ou_gone'])).resolves.toEqual({
      ou_sarah: 'usr_sarah',
    });
    await expect(reads.emailOf('org_1', 'usr_sarah')).resolves.toBe('s@x.test');
    await expect(reads.emailOf('org_1', 'usr_gone')).resolves.toBeNull();
  });

  it('describes a bundle, a course, a download or a community', async () => {
    const reads = notificationReads(
      deps({
        content: {
          ...base.content,
          getBundle: async () => ({ id: 'bun_1', name: 'Everything' }) as never,
          getCourse: async (id) =>
            (id === 'crs_1' ? { id, title: 'Spanish', type: 'course' } : null) as never,
          getDownload: async (id) =>
            (id === 'dwn_1' ? { id, title: 'Verbs', type: 'download' } : null) as never,
          getCommunity: async (id) =>
            (id === 'cmy_1' ? { id, title: 'Spring cohort', type: 'community' } : null) as never,
        },
      }),
    );
    await expect(reads.contentInfo('org_1', { bundleId: 'bun_1' })).resolves.toEqual({
      title: 'Everything',
      type: 'bundle',
    });
    await expect(reads.contentInfo('org_1', { contentId: 'crs_1' })).resolves.toEqual({
      title: 'Spanish',
      type: 'course',
    });
    await expect(reads.contentInfo('org_1', { contentId: 'dwn_1' })).resolves.toEqual({
      title: 'Verbs',
      type: 'download',
    });
    await expect(reads.contentInfo('org_1', { contentId: 'cmy_1' })).resolves.toEqual({
      title: 'Spring cohort',
      type: 'community',
    });
    await expect(reads.contentInfo('org_1', { contentId: 'x' })).resolves.toBeNull();
  });

  it('names the content a deleted grant opened that its person holds through no other grant', async () => {
    const listBundleItems = vi.fn(async () => [
      { orgId: 'org_1', bundleId: 'bnd_1', contentId: 'crs_1', createdAt: T, updatedAt: T },
      { orgId: 'org_1', bundleId: 'bnd_1', contentId: 'cmy_1', createdAt: T, updatedAt: T },
    ]);
    const hasAccess = vi.fn(
      async (_o: string, _u: string, contentId: string) => contentId === 'cmy_1',
    );
    const reads = notificationReads(
      deps({
        content: { ...base.content, listBundleItems },
        entitlements: { ...base.entitlements, hasAccess },
      }),
    );
    await expect(
      reads.contentLostBy('org_1', { orgUserId: 'ou_sarah', contentId: null, bundleId: 'bnd_1' }),
    ).resolves.toEqual(['crs_1']);
    expect(hasAccess).toHaveBeenCalledWith('org_1', 'ou_sarah', 'cmy_1');
    await expect(
      reads.contentLostBy('org_1', { orgUserId: 'ou_sarah', contentId: 'cmy_1', bundleId: null }),
    ).resolves.toEqual([]);
    await expect(
      reads.contentLostBy('org_1', { orgUserId: 'ou_sarah', contentId: null, bundleId: null }),
    ).resolves.toEqual([]);
  });

  it('reads a message that still stands', async () => {
    const reads = notificationReads(
      deps({
        chats: {
          ...base.chats,
          findMessage: async (_o, id) =>
            ({
              id,
              orgUserId: 'ou_james',
              chatId: 'cht_1',
              body: 'Hi',
              deletedAt: id === 'msg_deleted' ? new Date() : null,
            }) as never,
        },
      }),
    );
    await expect(reads.message('org_1', 'msg_1')).resolves.toEqual({
      orgUserId: 'ou_james',
      chatId: 'cht_1',
      body: 'Hi',
    });
    await expect(reads.message('org_1', 'msg_deleted')).resolves.toBeNull();
  });

  it('names the posts published in a window with their space and author', async () => {
    const from = new Date('2026-10-29T06:00:00Z');
    const to = new Date('2026-11-05T06:00:00Z');
    const publishedBetween = vi.fn(async () => [
      { postId: 'pst_1', spaceId: 'spc_1', title: 'Hola', orgUserId: 'ou_sarah', commentCount: 2 },
    ]);
    const reads = notificationReads(
      deps({
        posts: { ...base.posts, publishedBetween },
        content: {
          ...base.content,
          getSpace: async () =>
            ({ name: 'Announcements', communityId: 'cmy_1', capacity: null }) as never,
        },
        organizations: {
          ...base.organizations,
          getOrgUserById: async () => ({ id: 'ou_sarah', userId: 'usr_sarah' }) as OrgUser,
        },
        identity: { ...base.identity, displayName: async () => 'Sarah' },
      }),
    );
    await expect(reads.postsPublished('org_1', 'cmy_1', from, to)).resolves.toEqual([
      {
        postId: 'pst_1',
        spaceId: 'spc_1',
        title: 'Hola',
        authorName: 'Sarah',
        spaceName: 'Announcements',
        commentCount: 2,
      },
    ]);
    expect(publishedBetween).toHaveBeenCalledWith('org_1', 'cmy_1', from, to);
  });

  it('keeps the community mail reads', async () => {
    const reads = notificationReads(
      deps({
        content: { ...base.content, getCommunity: async () => ({ title: 'Spring' }) as never },
      }),
    );
    await expect(reads.communityTitle('org_1', 'cmy_1')).resolves.toBe('Spring');
    expect('recentMessageRecipients' in reads).toBe(false);
  });
});
