import { describe, expect, it, vi } from 'vitest';
import { NotFoundError } from '../../shared/errors.js';
import type { DomainEvent } from '../../shared/ports.js';
import type {
  NotificationCategory,
  Reason,
  RecipientList,
  StoredSetting,
} from '../../types/index.js';
import { emptyCommunityMail } from '../community-mail.js';
import type { NewDelivery, NewNotification, NotificationReads } from '../ports.js';
import { DEFAULT_COMMUNITY_CATEGORIES, DEFAULT_ORG_CATEGORIES } from './defaults.js';
import { NotificationProcessor } from './processor.js';
import { NOTIFICATION_TYPES } from './types.js';

const NOW = new Date('2026-11-03T12:00:00Z');

const EVENT: DomainEvent = {
  type: 'test.event',
  version: 1,
  id: 'evt_1',
  orgId: 'org_1',
  occurredAt: '2026-11-03T11:59:00.000Z',
  data: {},
};

const PEOPLE: Record<string, string> = {
  ou_sarah: 'usr_sarah',
  ou_james: 'usr_james',
  ou_emma: 'usr_emma',
  ou_noah: 'usr_noah',
};

function who(orgUserId: string, ...reasons: Reason[]) {
  return { orgUserId, userId: PEOPLE[orgUserId]!, reasons };
}

function commentList(
  recipients: ReturnType<typeof who>[],
  over: Partial<RecipientList> = {},
): RecipientList {
  return {
    type: 'comment.created',
    scope: 'space',
    actorOrgUserId: 'ou_james',
    communityId: 'cmy_1',
    spaceId: 'spc_practice',
    subject: { type: 'comment', id: 'cmt_1' },
    parent: { type: 'post', id: 'pst_1' },
    display: { postTitle: 'My first recording', commenterName: 'James', excerpt: 'Nice' },
    recipients,
    ...over,
  };
}

function mentionList(
  recipients: ReturnType<typeof who>[],
  over: Partial<RecipientList> = {},
): RecipientList {
  return {
    type: 'mention',
    scope: 'space',
    actorOrgUserId: 'ou_james',
    communityId: 'cmy_1',
    spaceId: 'spc_practice',
    subject: { type: 'comment', id: 'cmt_1' },
    parent: { type: 'post', id: 'pst_1' },
    display: { authorName: 'James', excerpt: 'Nice', postTitle: 'My first recording' },
    recipients,
    ...over,
  };
}

function postList(exclude: string[] = ['ou_james']): RecipientList {
  return {
    type: 'post.published',
    scope: 'space',
    actorOrgUserId: 'ou_james',
    communityId: 'cmy_1',
    spaceId: 'spc_practice',
    subject: { type: 'post', id: 'pst_2' },
    parent: null,
    display: {
      spaceName: 'Practice',
      postTitle: 'Rolling r',
      authorName: 'James',
      excerpt: 'Try this',
    },
    audience: { reason: 'space_member', spaceId: 'spc_practice', exclude },
  };
}

function setting(
  category: string,
  channel: string,
  enabled: boolean,
  spaceId: string | null = null,
  communityId: string | null = 'cmy_1',
): StoredSetting {
  return { communityId, spaceId, category, channel, enabled };
}

function memoryRepo() {
  const notifications: NewNotification[] = [];
  const deliveries: (NewDelivery & { status: string })[] = [];
  const keyOf = (row: NewNotification) =>
    `${row.sourceEventId}:${row.userId}:${row.communityId ?? ''}`;
  return {
    notifications,
    deliveries,
    insert: vi.fn(async (_orgId: string, rows: NewNotification[], news: NewDelivery[]) => {
      const kept = new Set<string>();
      for (const row of rows) {
        if (!notifications.some((stored) => keyOf(stored) === keyOf(row))) {
          notifications.push(row);
          kept.add(row.id);
        }
      }
      deliveries.push(
        ...news
          .filter((delivery) => kept.has(delivery.notificationId))
          .map((delivery) => ({ ...delivery, status: 'pending' })),
      );
    }),
    pendingDeliveriesForEvent: vi.fn(async (_orgId: string, sourceEventId: string) =>
      deliveries
        .filter(
          (delivery) =>
            delivery.status === 'pending' &&
            notifications.some(
              (row) => row.id === delivery.notificationId && row.sourceEventId === sourceEventId,
            ),
        )
        .map((delivery) => ({ id: delivery.id })),
    ),
  };
}

type Options = {
  lists?: RecipientList[];
  categories?: Record<string, NotificationCategory[]>;
  settings?: Record<string, StoredSetting[]>;
  devices?: string[];
  configured?: string[];
  openers?: string[];
  switchedOn?: string[];
  muted?: string[];
  deletedCommunities?: string[];
  categoryError?: Error;
};

function build(options: Options = {}) {
  const repo = memoryRepo();
  const configured = options.configured ?? ['inApp', 'email', 'push'];
  const reads: NotificationReads = {
    ...emptyCommunityMail,
    threadParticipants: async () => [],
    mutedAmong: vi.fn(async (_o: string, _item: unknown, ids: string[]) =>
      ids.filter((id) => (options.muted ?? []).includes(id)),
    ),
    communityMembers: async () => [],
    switchedOn: vi.fn(async () => options.switchedOn ?? []),
    courseHolders: async () => [],
    activity: async () => null,
    userIdsOf: async (_o: string, ids: string[]) =>
      Object.fromEntries(ids.flatMap((id) => (PEOPLE[id] ? [[id, PEOPLE[id]!]] : []))),
    emailOf: async () => null,
    contentInfo: async () => null,
    message: async () => null,
    postsPublished: async () => [],
    unreadInChat: async () => ({ count: 0, latest: null }),
    spaceOpeners: vi.fn(async () => options.openers ?? []),
    spaceOpenersAmong: vi.fn(async (_o: string, _s: string, ids: string[]) =>
      ids.filter((id) => (options.openers ?? []).includes(id)),
    ),
  };
  const listFor = vi.fn(async (_orgId: string, communityId: string | null) => {
    if (options.categoryError) {
      throw options.categoryError;
    }
    if (communityId && (options.deletedCommunities ?? []).includes(communityId)) {
      throw new NotFoundError('Community', communityId);
    }
    return (
      options.categories?.[communityId ?? 'org'] ??
      (communityId ? DEFAULT_COMMUNITY_CATEGORIES : DEFAULT_ORG_CATEGORIES)
    );
  });
  const getMany = vi.fn(async (_o: string, userIds: string[], _scope: unknown, _keys: string[]) =>
    Object.fromEntries(userIds.map((userId) => [userId, options.settings?.[userId] ?? []])),
  );
  const activeDevices = vi.fn(async (_o: string, userId: string) =>
    (options.devices ?? []).includes(userId)
      ? [
          {
            id: `dev_${userId}`,
            provider: 'apns' as const,
            token: 't',
            p256dh: null,
            auth: null,
            appId: 'com.app',
            environment: 'production' as const,
          },
        ]
      : [],
  );
  const deliver = vi.fn(async (_d: { orgId: string; deliveryId: string }) => {});
  const debounce = { arm: vi.fn(async () => {}), mentioned: vi.fn(async () => {}) };
  const rule = vi.fn(async () => options.lists ?? []);
  const processor = new NotificationProcessor({
    rules: { 'test.event': rule },
    reads,
    types: { get: (type) => NOTIFICATION_TYPES.find((declared) => declared.type === type) },
    channels: {
      list: () => configured,
      get: (key) =>
        key !== 'inApp' && configured.includes(key)
          ? { key, recipient: async () => null, deliver: async () => ({ deadDeviceIds: [] }) }
          : undefined,
    },
    categories: { listFor },
    settings: { getMany },
    devices: { activeDevices },
    repo,
    engine: { deliver },
    debounce,
    now: () => NOW,
  });
  return { processor, repo, reads, listFor, getMany, activeDevices, deliver, debounce, rule };
}

function stored(repo: ReturnType<typeof memoryRepo>, userId: string) {
  return repo.notifications.filter((row) => row.userId === userId);
}

function channelsOf(repo: ReturnType<typeof memoryRepo>, notification: NewNotification) {
  return repo.deliveries
    .filter((delivery) => delivery.notificationId === notification.id)
    .map((delivery) => delivery.channel)
    .sort();
}

describe('NotificationProcessor', () => {
  it('does nothing for an event with no rule', async () => {
    const { processor, repo } = build();
    await processor.process({ ...EVENT, type: 'progress.record.completed' });
    expect(repo.insert).not.toHaveBeenCalled();
    expect(repo.pendingDeliveriesForEvent).not.toHaveBeenCalled();
  });

  it('files a person who qualifies through several lists once, under the first matching category', async () => {
    const { processor, repo, deliver } = build({
      devices: ['usr_sarah'],
      lists: [
        commentList([who('ou_sarah', 'post_author'), who('ou_emma', 'follower')]),
        mentionList([who('ou_sarah', 'mentioned')]),
      ],
    });
    await processor.process(EVENT);
    const [sarah] = stored(repo, 'usr_sarah');
    expect(stored(repo, 'usr_sarah')).toHaveLength(1);
    expect(sarah).toMatchObject({
      type: 'mention',
      category: 'mentions',
      reasons: ['post_author', 'mentioned'],
      matchedReason: 'mentioned',
      sourceEventId: 'evt_1',
      scope: 'space',
      communityId: 'cmy_1',
      spaceId: 'spc_practice',
      actorOrgUserId: 'ou_james',
      subject: { type: 'comment', id: 'cmt_1' },
      parent: { type: 'post', id: 'pst_1' },
      display: { authorName: 'James', excerpt: 'Nice', postTitle: 'My first recording' },
      inApp: true,
      createdAt: NOW,
    });
    expect(channelsOf(repo, sarah!)).toEqual(['email', 'push']);
    const [emma] = stored(repo, 'usr_emma');
    expect(emma).toMatchObject({ type: 'comment.created', category: 'followed_posts' });
    expect(channelsOf(repo, emma!)).toEqual([]);
    expect(repo.insert).toHaveBeenCalledTimes(1);
    expect(deliver).toHaveBeenCalledTimes(2);
    expect(deliver.mock.calls.map(([d]) => d.orgId)).toEqual(['org_1', 'org_1']);
  });

  it('falls through to the next matching category when every channel of the first is off', async () => {
    const { processor, repo } = build({
      settings: {
        usr_sarah: [
          setting('mentions', 'inApp', false),
          setting('mentions', 'email', false),
          setting('mentions', 'push', false),
        ],
      },
      lists: [
        commentList([who('ou_sarah', 'post_author')]),
        mentionList([who('ou_sarah', 'mentioned')]),
      ],
    });
    await processor.process(EVENT);
    expect(stored(repo, 'usr_sarah')).toEqual([
      expect.objectContaining({
        type: 'comment.created',
        category: 'comments_on_my_posts',
        matchedReason: 'post_author',
        reasons: ['post_author', 'mentioned'],
        display: { postTitle: 'My first recording', commenterName: 'James', excerpt: 'Nice' },
      }),
    ]);
  });

  it("takes the matched reason in the order of the cover's reasons", async () => {
    const { processor, repo } = build({
      lists: [commentList([who('ou_emma', 'thread_participant', 'follower')])],
    });
    await processor.process(EVENT);
    expect(stored(repo, 'usr_emma')[0]).toMatchObject({
      category: 'followed_posts',
      matchedReason: 'follower',
      reasons: ['thread_participant', 'follower'],
    });
  });

  it('lets the list the rule returned first win when two lists match one category', async () => {
    const both: NotificationCategory = {
      key: 'activity',
      covers: [
        { type: 'mention', reasons: ['mentioned'] },
        { type: 'comment.created', reasons: ['post_author'] },
      ],
      channels: { inApp: { default: true, locked: false } },
    };
    const { processor, repo } = build({
      categories: { cmy_1: [both] },
      lists: [
        commentList([who('ou_sarah', 'post_author')]),
        mentionList([who('ou_sarah', 'mentioned')]),
      ],
    });
    await processor.process(EVENT);
    expect(stored(repo, 'usr_sarah')).toEqual([
      expect.objectContaining({ type: 'comment.created', category: 'activity' }),
    ]);
  });

  it('stores nothing for a person with no channel on in any matching category', async () => {
    const { processor, repo, deliver } = build({
      settings: {
        usr_emma: [
          setting('followed_posts', 'inApp', false),
          setting('followed_posts', 'push', false),
        ],
      },
      lists: [commentList([who('ou_emma', 'follower')])],
    });
    await processor.process(EVENT);
    expect(repo.notifications).toEqual([]);
    expect(repo.insert).not.toHaveBeenCalled();
    expect(deliver).not.toHaveBeenCalled();
  });

  it('counts push as on only when the person has a device seen in the last 30 days', async () => {
    const without = build({ lists: [commentList([who('ou_emma', 'follower')])] });
    await without.processor.process(EVENT);
    expect(channelsOf(without.repo, stored(without.repo, 'usr_emma')[0]!)).toEqual([]);
    expect(without.activeDevices).toHaveBeenCalledWith(
      'org_1',
      'usr_emma',
      new Date(NOW.getTime() - 30 * 24 * 60 * 60 * 1000),
    );
    const onlyPush = build({
      settings: { usr_emma: [setting('followed_posts', 'inApp', false)] },
      lists: [commentList([who('ou_emma', 'follower')])],
    });
    await onlyPush.processor.process(EVENT);
    expect(onlyPush.repo.notifications).toEqual([]);
    const withDevice = build({
      devices: ['usr_emma'],
      lists: [commentList([who('ou_emma', 'follower')])],
    });
    await withDevice.processor.process(EVENT);
    expect(channelsOf(withDevice.repo, stored(withDevice.repo, 'usr_emma')[0]!)).toEqual(['push']);
  });

  it('stores a notification kept out of the app when only an adapter channel is on', async () => {
    const { processor, repo } = build({
      settings: {
        usr_sarah: [
          setting('comments_on_my_posts', 'inApp', false),
          setting('comments_on_my_posts', 'push', false),
        ],
      },
      lists: [commentList([who('ou_sarah', 'post_author')])],
    });
    await processor.process(EVENT);
    const [sarah] = stored(repo, 'usr_sarah');
    expect(sarah).toMatchObject({ inApp: false, category: 'comments_on_my_posts' });
    expect(channelsOf(repo, sarah!)).toEqual(['email']);
  });

  it('uses only the channels the category offers and the deployment configures', async () => {
    const { processor, repo } = build({
      configured: ['inApp', 'push'],
      devices: ['usr_sarah'],
      lists: [mentionList([who('ou_sarah', 'mentioned')])],
    });
    await processor.process(EVENT);
    expect(channelsOf(repo, stored(repo, 'usr_sarah')[0]!)).toEqual(['push']);
  });

  it('files each community and the org separately', async () => {
    const { processor, repo, listFor, getMany } = build({
      lists: [
        commentList([who('ou_sarah', 'post_author')]),
        {
          type: 'comment.created',
          scope: 'org',
          actorOrgUserId: 'ou_james',
          communityId: null,
          spaceId: null,
          subject: { type: 'comment', id: 'cmt_9' },
          parent: { type: 'activity', id: 'act_1' },
          display: {
            activityTitle: 'Lesson 3',
            courseTitle: 'Spanish in 90 Days',
            courseId: 'crs_1',
            commenterName: 'James',
            excerpt: 'Hola',
          },
          recipients: [who('ou_sarah', 'comment_author')],
        },
      ],
    });
    await processor.process(EVENT);
    expect(listFor.mock.calls).toEqual([
      ['org_1', 'cmy_1'],
      ['org_1', null],
    ]);
    expect(getMany.mock.calls.map((call) => call[2])).toEqual([{ communityId: 'cmy_1' }, 'org']);
    expect(stored(repo, 'usr_sarah')).toEqual([
      expect.objectContaining({ communityId: 'cmy_1', category: 'comments_on_my_posts' }),
      expect.objectContaining({
        communityId: null,
        scope: 'org',
        category: 'replies_to_my_comments',
        spaceId: null,
      }),
    ]);
  });

  it('drops the group of a community that no longer exists and files the rest', async () => {
    const { processor, repo } = build({
      deletedCommunities: ['cmy_gone'],
      lists: [
        commentList([who('ou_sarah', 'post_author')], { communityId: 'cmy_gone' }),
        commentList([who('ou_emma', 'post_author')]),
      ],
    });
    await expect(processor.process(EVENT)).resolves.toBeUndefined();
    expect(repo.notifications.map((row) => row.userId)).toEqual(['usr_emma']);
  });

  it('propagates any other failure to read categories', async () => {
    const error = new Error('settings table down');
    const { processor } = build({
      categoryError: error,
      lists: [commentList([who('ou_sarah', 'post_author')])],
    });
    await expect(processor.process(EVENT)).rejects.toBe(error);
  });

  it('matches a per-space category only for a notification that occurs in a space', async () => {
    const perSpaceMentions: NotificationCategory = {
      key: 'chat_mentions',
      perSpace: true,
      covers: [{ type: 'mention', reasons: ['mentioned'] }],
      channels: { inApp: { default: true, locked: false } },
    };
    const { processor, repo } = build({
      categories: { cmy_1: [perSpaceMentions] },
      lists: [
        mentionList([who('ou_sarah', 'mentioned')], {
          scope: 'chat',
          spaceId: null,
          subject: { type: 'message', id: 'msg_1' },
          parent: { type: 'chat', id: 'cht_1' },
          display: { authorName: 'James', excerpt: 'Hey', chatTitle: 'James' },
        }),
        mentionList([who('ou_emma', 'mentioned')]),
      ],
    });
    await processor.process(EVENT);
    expect(repo.notifications.map((row) => row.userId)).toEqual(['usr_emma']);
  });

  it('applies a per-space setting for the space of the notification', async () => {
    const { processor, repo } = build({
      settings: {
        usr_emma: [setting('new_posts', 'inApp', true, 'spc_practice')],
      },
      switchedOn: ['ou_emma'],
      openers: ['ou_emma', 'ou_sarah', 'ou_james'],
      lists: [postList()],
    });
    await processor.process(EVENT);
    expect(stored(repo, 'usr_emma')).toEqual([
      expect.objectContaining({
        type: 'post.published',
        category: 'new_posts',
        spaceId: 'spc_practice',
      }),
    ]);
  });

  describe('audience', () => {
    it('lists only members who switched the category on and can open the space when it is off by default', async () => {
      const { processor, repo, reads } = build({
        switchedOn: ['ou_emma', 'ou_noah'],
        openers: ['ou_emma', 'ou_sarah', 'ou_james'],
        settings: { usr_emma: [setting('new_posts', 'inApp', true)] },
        lists: [postList()],
      });
      await processor.process(EVENT);
      expect(reads.switchedOn).toHaveBeenCalledWith('org_1', 'cmy_1', 'new_posts', 'spc_practice');
      expect(reads.spaceOpenersAmong).toHaveBeenCalledWith('org_1', 'spc_practice', [
        'ou_emma',
        'ou_noah',
      ]);
      expect(reads.spaceOpeners).not.toHaveBeenCalled();
      expect(repo.notifications.map((row) => row.userId)).toEqual(['usr_emma']);
      expect(stored(repo, 'usr_emma')[0]).toMatchObject({
        reasons: ['space_member'],
        matchedReason: 'space_member',
      });
    });

    it('lists everyone who can open the space when the space default turns a channel on', async () => {
      const newPosts = DEFAULT_COMMUNITY_CATEGORIES.find(
        (category) => category.key === 'new_posts',
      )!;
      const { processor, repo, reads } = build({
        categories: {
          cmy_1: [{ ...newPosts, spaceDefaults: { spc_practice: { inApp: true } } }],
        },
        openers: ['ou_emma', 'ou_sarah', 'ou_james'],
        settings: { usr_sarah: [setting('new_posts', 'inApp', false, 'spc_practice')] },
        lists: [postList()],
      });
      await processor.process(EVENT);
      expect(reads.spaceOpeners).toHaveBeenCalledWith('org_1', 'spc_practice');
      expect(reads.switchedOn).not.toHaveBeenCalled();
      expect(repo.notifications.map((row) => row.userId)).toEqual(['usr_emma']);
    });

    it('lists everyone who can open the space when the category is on by default, less exclusions and mutes', async () => {
      const onByDefault: NotificationCategory = {
        key: 'new_posts',
        perSpace: true,
        covers: [{ type: 'post.published', reasons: ['space_member'] }],
        channels: { inApp: { default: true, locked: false } },
      };
      const { processor, repo, reads } = build({
        categories: { cmy_1: [onByDefault] },
        openers: ['ou_emma', 'ou_sarah', 'ou_james', 'ou_noah'],
        muted: ['ou_noah'],
        lists: [postList(['ou_james'])],
      });
      await processor.process(EVENT);
      expect(reads.mutedAmong).toHaveBeenCalledWith(
        'org_1',
        { type: 'space', id: 'spc_practice' },
        ['ou_emma', 'ou_sarah', 'ou_noah'],
        NOW,
      );
      expect(repo.notifications.map((row) => row.userId).sort()).toEqual(['usr_emma', 'usr_sarah']);
    });

    it('expands to nobody when no category covers it', async () => {
      const { processor, repo, reads } = build({
        categories: { cmy_1: DEFAULT_COMMUNITY_CATEGORIES.filter((c) => c.key !== 'new_posts') },
        openers: ['ou_emma'],
        lists: [postList()],
      });
      await processor.process(EVENT);
      expect(reads.spaceOpeners).not.toHaveBeenCalled();
      expect(repo.notifications).toEqual([]);
    });
  });

  describe('validation', () => {
    it.each([
      ['an unknown type', commentList([who('ou_sarah', 'post_author')], { type: 'post.liked' })],
      ['a reason the type does not allow', commentList([who('ou_sarah', 'mentioned')])],
      [
        'display keys that differ from the declaration',
        commentList([who('ou_sarah', 'post_author')], { display: { postTitle: 'x' } }),
      ],
      [
        'a scope the type does not declare',
        commentList([who('ou_sarah', 'post_author')], { scope: 'chat' }),
      ],
      [
        'both recipients and an audience',
        { ...postList(), recipients: [who('ou_sarah', 'space_member')] },
      ],
    ])('drops a list with %s and files the others', async (_name, bad) => {
      const { processor, repo } = build({
        lists: [bad, commentList([who('ou_emma', 'follower')])],
      });
      await expect(processor.process(EVENT)).resolves.toBeUndefined();
      expect(repo.notifications.map((row) => row.userId)).toEqual(['usr_emma']);
    });
  });

  describe('redelivery', () => {
    it('inserts nothing twice and dispatches the deliveries still pending', async () => {
      const { processor, repo, deliver } = build({
        devices: ['usr_sarah'],
        lists: [mentionList([who('ou_sarah', 'mentioned')])],
      });
      await processor.process(EVENT);
      expect(repo.notifications).toHaveLength(1);
      expect(repo.deliveries).toHaveLength(2);
      const firstRound = deliver.mock.calls.map(([d]) => d.deliveryId);
      repo.deliveries[0]!.status = 'sent';
      deliver.mockClear();
      await processor.process(EVENT);
      expect(repo.notifications).toHaveLength(1);
      expect(repo.deliveries).toHaveLength(2);
      expect(deliver.mock.calls.map(([d]) => d.deliveryId)).toEqual([firstRound[1]]);
    });

    it('propagates a dispatch failure so the outbox redelivers', async () => {
      const { processor, deliver } = build({
        devices: ['usr_sarah'],
        lists: [mentionList([who('ou_sarah', 'mentioned')])],
      });
      const error = new Error('hatchet down');
      deliver.mockRejectedValueOnce(error);
      await expect(processor.process(EVENT)).rejects.toBe(error);
    });
  });

  describe('chat debounce', () => {
    const chat = {
      scope: 'chat' as const,
      spaceId: null,
      subject: { type: 'message' as const, id: 'msg_1' },
      parent: { type: 'chat' as const, id: 'cht_1' },
    };

    it('hands message.sent lists to the debounce instead of storing them', async () => {
      const sent: RecipientList = {
        type: 'message.sent',
        actorOrgUserId: 'ou_james',
        communityId: 'cmy_1',
        display: { senderName: 'James', chatTitle: 'James', excerpt: 'Hi', count: '1' },
        recipients: [who('ou_sarah', 'participant')],
        ...chat,
      };
      const { processor, repo, debounce } = build({ lists: [sent] });
      await processor.process(EVENT);
      expect(debounce.arm).toHaveBeenCalledWith('org_1', sent, new Date(EVENT.occurredAt));
      expect(repo.notifications).toEqual([]);
    });

    it('tells the debounce about a mention filed in a chat', async () => {
      const { processor, debounce } = build({
        lists: [
          mentionList([who('ou_sarah', 'mentioned')], {
            ...chat,
            display: { authorName: 'James', excerpt: 'Hey', chatTitle: 'James' },
          }),
        ],
      });
      await processor.process(EVENT);
      expect(debounce.mentioned).toHaveBeenCalledWith('org_1', 'usr_sarah', 'cht_1');
    });

    it('files message.sent lists handed back by the flush', async () => {
      const { processor, repo, debounce } = build({});
      await processor.file(
        'org_1',
        'chat-flush:cht_1:msg_9',
        [
          {
            type: 'message.sent',
            actorOrgUserId: 'ou_james',
            communityId: 'cmy_1',
            display: { senderName: 'James', chatTitle: 'James', excerpt: 'Hi', count: '3' },
            recipients: [who('ou_sarah', 'participant')],
            ...chat,
          },
        ],
        { occurredAt: NOW, debounce: false },
      );
      expect(debounce.arm).not.toHaveBeenCalled();
      expect(stored(repo, 'usr_sarah')).toEqual([
        expect.objectContaining({
          type: 'message.sent',
          category: 'messages',
          sourceEventId: 'chat-flush:cht_1:msg_9',
        }),
      ]);
    });
  });
});
