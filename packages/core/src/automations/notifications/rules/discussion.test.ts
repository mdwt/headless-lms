import { describe, expect, it, vi } from 'vitest';
import { discussionEvents } from '../../../discussion/index.js';
import type { DomainEvent } from '../../../shared/ports.js';
import type { RecipientList, SubjectRef } from '../../../types/index.js';
import { emptyCommunityMail } from '../../community-mail.js';
import type { NotificationReads } from '../../ports.js';
import { NOTIFICATION_TYPES } from '../types.js';
import { DISCUSSION_RULES } from './discussion.js';

const ORG = 'org_1';
const AT = '2026-11-03T09:00:00.000Z';
const T = new Date('2026-11-01T00:00:00Z');

const NAMES: Record<string, string> = {
  ou_sarah: 'Sarah',
  ou_james: 'James',
  ou_emma: 'Emma',
  ou_noah: 'Noah',
  ou_mia: 'Mia',
  ou_olivia: 'Olivia',
};
const EVERYONE = Object.keys(NAMES);

const SPACES: Record<string, { name: string; communityId: string; capacity: number | null }> = {
  spc_practice: { name: 'Practice', communityId: 'cmy_1', capacity: null },
  spc_news: { name: 'Announcements', communityId: 'cmy_1', capacity: null },
  spc_speaking: { name: 'Speaking partners', communityId: 'cmy_1', capacity: null },
};

const POST = {
  orgId: ORG,
  id: 'pst_1',
  communityId: 'cmy_1',
  spaceId: 'spc_practice',
  orgUserId: 'ou_sarah',
  topicId: null,
  title: 'My first recording',
  body: 'Listen to this, <@ou_emma>',
  extra: null,
  coverAssetId: null,
  status: 'published' as const,
  scheduledAt: null,
  publishedAt: T,
  removedBy: null,
  pinned: false,
  commentsClosed: null,
  reactionsEnabled: null,
  createdAt: T,
  updatedAt: T,
};

const COMMENT = {
  id: 'cmt_2',
  orgId: ORG,
  activityId: null,
  postId: 'pst_1',
  communityId: 'cmy_1',
  parentId: 'cmt_1',
  orgUserId: 'ou_james',
  body: 'Nice one <@ou_noah>',
  status: 'published' as const,
  removedBy: null,
  createdAt: T,
  updatedAt: T,
};

const ACTIVITY_COMMENT = {
  ...COMMENT,
  activityId: 'act_1',
  postId: null,
  communityId: null,
};

const MESSAGE = {
  orgId: ORG,
  id: 'msg_1',
  communityId: 'cmy_1',
  chatId: 'cht_1',
  orgUserId: 'ou_james',
  body: 'Hola <@ou_emma>',
  replyToId: null,
  editedAt: null,
  deletedAt: null,
  createdAt: T,
  updatedAt: T,
};

type Participant = { orgUserId: string; leftAt: Date | null };

type World = {
  openers?: Record<string, string[]>;
  members?: string[];
  muted?: Record<string, string[]>;
  followers?: string[];
  thread?: string[];
  moderators?: string[];
  staff?: string[];
  holders?: string[];
  blocked?: string[];
  participants?: Participant[];
  chatKind?: 'direct' | 'group';
  chatStatus?: 'pending' | 'open' | 'closed';
  posts?: { postId: string; spaceId: string; title: string }[];
};

function fakeReads(world: World = {}) {
  const muted = vi.fn(async (_o: string, item: SubjectRef, ids: string[], _at: Date) =>
    ids.filter((id) => (world.muted?.[`${item.type}:${item.id}`] ?? []).includes(id)),
  );
  const participants = world.participants ?? [
    { orgUserId: 'ou_james', leftAt: null },
    { orgUserId: 'ou_sarah', leftAt: null },
    { orgUserId: 'ou_emma', leftAt: null },
    { orgUserId: 'ou_noah', leftAt: T },
  ];
  const opens = (spaceId: string) => world.openers?.[spaceId] ?? EVERYONE;
  const reads: NotificationReads = {
    ...emptyCommunityMail,
    displayName: async (_o, id) => NAMES[id] ?? 'A member',
    space: async (_o, spaceId) => SPACES[spaceId] ?? null,
    spaceOpenersAmong: async (_o, spaceId, ids) => ids.filter((id) => opens(spaceId).includes(id)),
    spaceOpeners: async (_o, spaceId) => opens(spaceId),
    communityMembersAmong: async (_o, _c, ids) =>
      ids.filter((id) => (world.members ?? EVERYONE).includes(id)),
    communityMembers: async () => world.members ?? EVERYONE,
    communityTitle: async () => 'Spring cohort',
    moderationAudience: async () => world.moderators ?? ['ou_mia', 'ou_olivia'],
    staffIds: async () => world.staff ?? ['ou_olivia'],
    followerIds: async () => world.followers ?? [],
    threadParticipants: async () => world.thread ?? [],
    mutedAmong: muted,
    switchedOn: async () => [],
    emailOf: async () => null,
    contentInfo: async () => null,
    unreadInChat: async () => ({ count: 0, latest: null }),
    courseHolders: async () => world.holders ?? [],
    contentLostBy: async () => [],
    pairBlocked: async (_o, _c, _a, b) => (world.blocked ?? []).includes(b),
    userIdsOf: async (_o, ids) =>
      Object.fromEntries(ids.filter((id) => NAMES[id]).map((id) => [id, `usr_${id.slice(3)}`])),
    post: async (_o, postId) =>
      postId === POST.id
        ? {
            title: POST.title,
            body: POST.body,
            spaceId: POST.spaceId,
            orgUserId: POST.orgUserId,
            communityId: POST.communityId,
          }
        : null,
    comment: async (_o, commentId) =>
      commentId === 'cmt_1'
        ? { orgUserId: 'ou_emma', postId: 'pst_1', activityId: null, parentId: null, body: 'Hi' }
        : commentId === 'cmt_2'
          ? {
              orgUserId: 'ou_james',
              postId: 'pst_1',
              activityId: null,
              parentId: 'cmt_1',
              body: 'Nice one <@ou_noah>',
            }
          : commentId === 'cmt_9'
            ? {
                orgUserId: 'ou_james',
                postId: null,
                activityId: 'act_1',
                parentId: null,
                body: 'Great lesson',
              }
            : null,
    activity: async () => ({
      title: 'Rolling r',
      moduleTitle: 'Sounds',
      courseId: 'crs_1',
      courseTitle: 'Spanish in 90 Days',
    }),
    chat: async () => ({
      communityId: 'cmy_1',
      kind: world.chatKind ?? 'group',
      status: world.chatStatus ?? 'open',
      createdBy: 'ou_james',
      participants: participants.map((participant) => ({
        ...participant,
        muted: false,
        mutedUntil: null,
      })),
    }),
    message: async (_o, messageId) =>
      messageId === 'msg_1' ? { orgUserId: 'ou_sarah', chatId: 'cht_1', body: 'See you' } : null,
    latestMessageBody: async () => 'Can we practise? <@ou_sarah>',
    postsPublished: async () =>
      (world.posts ?? []).map((post) => ({
        ...post,
        authorName: 'Sarah',
        spaceName: SPACES[post.spaceId]!.name,
        commentCount: 2,
      })),
  };
  return { reads, muted };
}

function ready(
  made: { type: string; version: number; orgId: string; data: unknown },
  metadata?: DomainEvent['metadata'],
): DomainEvent {
  return {
    id: 'evt_1',
    occurredAt: AT,
    type: made.type,
    version: made.version,
    orgId: made.orgId,
    data: made.data,
    ...(metadata ? { metadata } : {}),
  };
}

async function run(event: DomainEvent, world: World = {}) {
  const { reads, muted } = fakeReads(world);
  const lists = await DISCUSSION_RULES[event.type]!(event, reads);
  for (const list of lists) {
    const declared = NOTIFICATION_TYPES.find((type) => type.type === list.type);
    expect(declared?.scopes, list.type).toContain(list.scope);
    expect(Object.keys(list.display).sort(), list.type).toEqual(
      [...(declared?.display[list.scope] ?? [])].sort(),
    );
    for (const recipient of list.recipients ?? []) {
      for (const reason of recipient.reasons) {
        expect(declared?.reasons, list.type).toContain(reason);
      }
    }
  }
  return { lists, muted };
}

function people(list: RecipientList | undefined) {
  return Object.fromEntries((list?.recipients ?? []).map((r) => [r.orgUserId, r.reasons]));
}

function byType(lists: RecipientList[], type: string) {
  return lists.find((list) => list.type === type);
}

describe('discussion.post.published', () => {
  const published = (metadata?: DomainEvent['metadata'], mentioned = ['ou_emma', 'ou_sarah']) =>
    ready(
      discussionEvents.postPublished.make({
        orgId: ORG,
        data: { ...POST, mentionedOrgUserIds: mentioned },
      }),
      metadata,
    );

  it('returns the space audience without the author and the people the post mentions', async () => {
    const { lists } = await run(published({ actorOrgUserId: 'ou_sarah', previousStatus: null }));
    expect(lists.map((list) => list.type)).toEqual(['mention', 'post.published']);
    expect(byType(lists, 'post.published')).toEqual({
      type: 'post.published',
      scope: 'space',
      actorOrgUserId: 'ou_sarah',
      communityId: 'cmy_1',
      spaceId: 'spc_practice',
      subject: { type: 'post', id: 'pst_1' },
      parent: null,
      display: {
        spaceName: 'Practice',
        postTitle: 'My first recording',
        authorName: 'Sarah',
        excerpt: 'Listen to this, Emma',
      },
      audience: { reason: 'space_member', spaceId: 'spc_practice', exclude: ['ou_sarah'] },
    });
    expect(byType(lists, 'mention')?.recipients).toEqual([
      { orgUserId: 'ou_emma', userId: 'usr_emma', reasons: ['mentioned'] },
    ]);
    expect(byType(lists, 'mention')?.display).toEqual({
      authorName: 'Sarah',
      excerpt: 'Listen to this, Emma',
      postTitle: 'My first recording',
    });
  });

  it('notifies nobody when a removed post is restored', async () => {
    const { lists } = await run(published({ actorOrgUserId: 'ou_mia', previousStatus: 'removed' }));
    expect(lists).toEqual([]);
  });

  it('tells the author their post was approved only when it left review', async () => {
    const approved = await run(published({ actorOrgUserId: 'ou_mia', previousStatus: 'pending' }));
    expect(people(byType(approved.lists, 'post.approved'))).toEqual({ ou_sarah: ['subject'] });
    expect(byType(approved.lists, 'post.approved')).toMatchObject({
      actorOrgUserId: 'ou_mia',
      display: { postTitle: 'My first recording', spaceName: 'Practice' },
    });
    expect(byType(approved.lists, 'post.published')?.audience?.exclude).toEqual([
      'ou_sarah',
      'ou_mia',
    ]);
    const scheduled = await run(published(undefined));
    expect(byType(scheduled.lists, 'post.approved')).toBeUndefined();
    const fromDraft = await run(published({ actorOrgUserId: 'ou_sarah', previousStatus: 'draft' }));
    expect(byType(fromDraft.lists, 'post.approved')).toBeUndefined();
  });

  it('mentions only people who can open the space, muted or not', async () => {
    const { lists } = await run(published(undefined, ['ou_emma', 'ou_noah']), {
      openers: { spc_practice: ['ou_sarah', 'ou_emma'] },
      muted: { 'space:spc_practice': ['ou_emma'] },
    });
    expect(people(byType(lists, 'mention'))).toEqual({ ou_emma: ['mentioned'] });
  });
});

describe('discussion.post.created and discussion.post.updated', () => {
  it('asks the moderators to review a post created in review, never its author', async () => {
    const { lists } = await run(
      ready(
        discussionEvents.postCreated.make({ orgId: ORG, data: { ...POST, status: 'pending' } }),
        {
          actorOrgUserId: 'ou_sarah',
          previousStatus: null,
        },
      ),
      { moderators: ['ou_mia', 'ou_sarah'] },
    );
    expect(lists).toEqual([
      expect.objectContaining({
        type: 'post.awaiting_review',
        scope: 'space',
        subject: { type: 'post', id: 'pst_1' },
        display: { spaceName: 'Practice', postTitle: 'My first recording', authorName: 'Sarah' },
      }),
    ]);
    expect(people(lists[0])).toEqual({ ou_mia: ['moderator'] });
  });

  it('asks for nothing when a post is created published', async () => {
    const { lists } = await run(
      ready(discussionEvents.postCreated.make({ orgId: ORG, data: POST }), {
        actorOrgUserId: 'ou_sarah',
      }),
    );
    expect(lists).toEqual([]);
  });

  it('asks for review when a post moves into review and not when it was already there', async () => {
    const event = (previousStatus: string) =>
      ready(
        discussionEvents.postUpdated.make({
          orgId: ORG,
          data: { ...POST, status: 'pending', mentionedOrgUserIds: [] },
        }),
        { actorOrgUserId: 'ou_sarah', previousStatus },
      );
    expect((await run(event('draft'))).lists.map((list) => list.type)).toEqual([
      'post.awaiting_review',
    ]);
    expect((await run(event('pending'))).lists).toEqual([]);
  });

  it('mentions the people an edit of a published post newly mentions', async () => {
    const { lists } = await run(
      ready(
        discussionEvents.postUpdated.make({
          orgId: ORG,
          data: { ...POST, mentionedOrgUserIds: ['ou_noah'] },
        }),
        { actorOrgUserId: 'ou_sarah', previousStatus: 'published' },
      ),
    );
    expect(lists.map((list) => list.type)).toEqual(['mention']);
    expect(people(lists[0])).toEqual({ ou_noah: ['mentioned'] });
  });
});

describe('discussion.post.removed', () => {
  const removed = (removedBy: string) =>
    ready(
      discussionEvents.postRemoved.make({
        orgId: ORG,
        data: { ...POST, status: 'removed', removedBy },
      }),
      { actorOrgUserId: removedBy, previousStatus: 'published' },
    );

  it('tells the author when someone else removes their post, mute or not', async () => {
    const { lists } = await run(removed('ou_mia'), { muted: { 'post:pst_1': ['ou_sarah'] } });
    expect(lists).toEqual([
      expect.objectContaining({
        type: 'post.removed',
        actorOrgUserId: 'ou_mia',
        display: { postTitle: 'My first recording', spaceName: 'Practice' },
      }),
    ]);
    expect(people(lists[0])).toEqual({ ou_sarah: ['subject'] });
  });

  it('tells nobody when the author removes their own post', async () => {
    expect((await run(removed('ou_sarah'))).lists).toEqual([]);
  });

  it('tells nobody who can no longer open the space', async () => {
    const { lists } = await run(removed('ou_mia'), { openers: { spc_practice: ['ou_mia'] } });
    expect(lists).toEqual([]);
  });
});

describe('discussion.post.reaction.added', () => {
  const reacted = (orgUserId: string) =>
    ready(
      discussionEvents.postReactionAdded.make({
        orgId: ORG,
        data: {
          postId: 'pst_1',
          spaceId: 'spc_practice',
          communityId: 'cmy_1',
          orgUserId,
          reaction: '🔥',
        },
      }),
    );

  it('tells the post author who reacted', async () => {
    const { lists } = await run(reacted('ou_james'));
    expect(lists).toEqual([
      expect.objectContaining({
        type: 'post.reacted',
        actorOrgUserId: 'ou_james',
        subject: { type: 'post', id: 'pst_1' },
        display: { postTitle: 'My first recording', reactorName: 'James', reaction: '🔥' },
      }),
    ]);
    expect(people(lists[0])).toEqual({ ou_sarah: ['post_author'] });
  });

  it('tells nobody about their own reaction, a muted post or space, or a space they cannot open', async () => {
    expect((await run(reacted('ou_sarah'))).lists).toEqual([]);
    expect(
      (await run(reacted('ou_james'), { muted: { 'post:pst_1': ['ou_sarah'] } })).lists,
    ).toEqual([]);
    expect(
      (await run(reacted('ou_james'), { muted: { 'space:spc_practice': ['ou_sarah'] } })).lists,
    ).toEqual([]);
    expect(
      (await run(reacted('ou_james'), { openers: { spc_practice: ['ou_james'] } })).lists,
    ).toEqual([]);
  });
});

describe('discussion.comment.created', () => {
  const created = (data: Record<string, unknown>, metadata?: DomainEvent['metadata']) =>
    ready(
      discussionEvents.commentCreated.make({
        orgId: ORG,
        data: { ...COMMENT, mentionedOrgUserIds: ['ou_noah', 'ou_sarah'], ...data },
      }),
      metadata,
    );

  it('lists the post author, the replied-to author, followers and thread participants, and the mentioned', async () => {
    const { lists } = await run(created({}, { actorOrgUserId: 'ou_james' }), {
      followers: ['ou_emma', 'ou_noah', 'ou_james'],
      thread: ['ou_james', 'ou_emma', 'ou_sarah', 'ou_mia'],
      openers: { spc_practice: ['ou_sarah', 'ou_james', 'ou_emma', 'ou_noah'] },
    });
    expect(lists.map((list) => list.type)).toEqual(['comment.created', 'mention']);
    const [comment, mention] = lists;
    expect(comment).toMatchObject({
      scope: 'space',
      actorOrgUserId: 'ou_james',
      communityId: 'cmy_1',
      spaceId: 'spc_practice',
      subject: { type: 'comment', id: 'cmt_2' },
      parent: { type: 'post', id: 'pst_1' },
      display: {
        postTitle: 'My first recording',
        commenterName: 'James',
        excerpt: 'Nice one Noah',
      },
    });
    expect(people(comment)).toEqual({
      ou_sarah: ['post_author', 'thread_participant'],
      ou_emma: ['comment_author', 'follower', 'thread_participant'],
      ou_noah: ['follower'],
    });
    expect(mention?.display).toEqual({
      postTitle: 'My first recording',
      authorName: 'James',
      excerpt: 'Nice one Noah',
    });
    expect(people(mention)).toEqual({ ou_noah: ['mentioned'], ou_sarah: ['mentioned'] });
  });

  it('applies mutes on the post and the space last, keeping mentions', async () => {
    const { lists, muted } = await run(created({}, { actorOrgUserId: 'ou_james' }), {
      followers: ['ou_noah'],
      muted: { 'post:pst_1': ['ou_sarah'], 'space:spc_practice': ['ou_emma'] },
    });
    expect(people(byType(lists, 'comment.created'))).toEqual({ ou_noah: ['follower'] });
    expect(people(byType(lists, 'mention'))).toEqual({
      ou_noah: ['mentioned'],
      ou_sarah: ['mentioned'],
    });
    expect(muted).toHaveBeenCalledWith(
      ORG,
      { type: 'post', id: 'pst_1' },
      expect.any(Array),
      new Date(AT),
    );
  });

  it('produces nothing for a pending comment', async () => {
    expect((await run(created({ status: 'pending', mentionedOrgUserIds: [] }))).lists).toEqual([]);
  });

  it('files a comment on a course activity in the org, for people who can open the course', async () => {
    const { lists } = await run(created({ ...ACTIVITY_COMMENT, parentId: 'cmt_9' }), {
      thread: ['ou_james', 'ou_emma', 'ou_noah'],
      holders: ['ou_emma', 'ou_sarah'],
      staff: ['ou_noah'],
    });
    expect(lists.map((list) => list.type)).toEqual(['comment.created', 'mention']);
    expect(lists[0]).toMatchObject({
      scope: 'org',
      communityId: null,
      spaceId: null,
      parent: { type: 'activity', id: 'act_1' },
      display: {
        activityTitle: 'Rolling r',
        courseTitle: 'Spanish in 90 Days',
        courseId: 'crs_1',
        commenterName: 'James',
        excerpt: 'Nice one Noah',
      },
    });
    expect(people(lists[0])).toEqual({
      ou_emma: ['thread_participant'],
      ou_noah: ['thread_participant'],
    });
    expect(people(lists[1])).toEqual({ ou_noah: ['mentioned'], ou_sarah: ['mentioned'] });
    expect(lists[1]?.display).toEqual({
      authorName: 'James',
      excerpt: 'Nice one Noah',
      activityTitle: 'Rolling r',
      courseTitle: 'Spanish in 90 Days',
      courseId: 'crs_1',
    });
  });
});

describe('discussion.comment.published and discussion.comment.updated', () => {
  it('files an approved comment like a new one', async () => {
    const { lists } = await run(
      ready(
        discussionEvents.commentPublished.make({
          orgId: ORG,
          data: { ...COMMENT, mentionedOrgUserIds: [] },
        }),
      ),
    );
    expect(people(byType(lists, 'comment.created'))).toEqual({
      ou_sarah: ['post_author'],
      ou_emma: ['comment_author'],
    });
  });

  it('leaves out the moderator who approved the comment', async () => {
    const { lists } = await run(
      ready(
        discussionEvents.commentPublished.make({
          orgId: ORG,
          data: { ...COMMENT, mentionedOrgUserIds: ['ou_mia', 'ou_noah'] },
        }),
        { actorOrgUserId: 'ou_mia' },
      ),
      { followers: ['ou_mia'], thread: ['ou_mia', 'ou_emma'] },
    );
    expect(byType(lists, 'comment.created')?.actorOrgUserId).toBe('ou_james');
    expect(people(byType(lists, 'comment.created'))).toEqual({
      ou_sarah: ['post_author'],
      ou_emma: ['comment_author', 'thread_participant'],
    });
    expect(people(byType(lists, 'mention'))).toEqual({ ou_noah: ['mentioned'] });
  });

  it('mentions the people an edit newly mentions, only for a published comment', async () => {
    const edited = (status: 'published' | 'pending') =>
      ready(
        discussionEvents.commentUpdated.make({
          orgId: ORG,
          data: { ...COMMENT, status, mentionedOrgUserIds: ['ou_emma'] },
        }),
        { actorOrgUserId: 'ou_james' },
      );
    const { lists } = await run(edited('published'));
    expect(lists.map((list) => list.type)).toEqual(['mention']);
    expect(people(lists[0])).toEqual({ ou_emma: ['mentioned'] });
    expect((await run(edited('pending'))).lists).toEqual([]);
  });
});

describe('discussion.comment.removed', () => {
  const removed = (data: Record<string, unknown>, metadata?: DomainEvent['metadata']) =>
    ready(
      discussionEvents.commentRemoved.make({
        orgId: ORG,
        data: { ...COMMENT, status: 'removed', ...data },
      }),
      metadata,
    );

  it('tells the author when someone else removes their comment', async () => {
    const { lists } = await run(removed({ removedBy: 'ou_mia' }, { actorOrgUserId: 'ou_mia' }), {
      muted: { 'post:pst_1': ['ou_james'] },
    });
    expect(lists).toEqual([
      expect.objectContaining({
        type: 'comment.removed',
        scope: 'space',
        actorOrgUserId: 'ou_mia',
        display: { postTitle: 'My first recording' },
      }),
    ]);
    expect(people(lists[0])).toEqual({ ou_james: ['subject'] });
  });

  it('tells nobody when the author removes it', async () => {
    expect((await run(removed({ removedBy: 'ou_james' }))).lists).toEqual([]);
  });

  it('files a removed activity comment in the org', async () => {
    const { lists } = await run(removed({ ...ACTIVITY_COMMENT, removedBy: 'ou_olivia' }), {
      holders: ['ou_james'],
    });
    expect(lists[0]).toMatchObject({
      type: 'comment.removed',
      scope: 'org',
      display: { activityTitle: 'Rolling r', courseTitle: 'Spanish in 90 Days', courseId: 'crs_1' },
    });
    expect(people(lists[0])).toEqual({ ou_james: ['subject'] });
  });
});

describe('discussion.comment.reaction.added', () => {
  const reacted = (commentId: string, orgUserId: string) =>
    ready(
      discussionEvents.commentReactionAdded.make({
        orgId: ORG,
        data: {
          commentId,
          postId: commentId === 'cmt_9' ? null : 'pst_1',
          activityId: commentId === 'cmt_9' ? 'act_1' : null,
          spaceId: commentId === 'cmt_9' ? null : 'spc_practice',
          communityId: commentId === 'cmt_9' ? null : 'cmy_1',
          orgUserId,
          reaction: '👍',
        },
      }),
    );

  it('tells the comment author, unless they muted the post or reacted themselves', async () => {
    const { lists } = await run(reacted('cmt_2', 'ou_sarah'));
    expect(lists[0]).toMatchObject({
      type: 'comment.reacted',
      scope: 'space',
      subject: { type: 'comment', id: 'cmt_2' },
      display: {
        postTitle: 'My first recording',
        excerpt: 'Nice one Noah',
        reactorName: 'Sarah',
        reaction: '👍',
      },
    });
    expect(people(lists[0])).toEqual({ ou_james: ['comment_author'] });
    expect((await run(reacted('cmt_2', 'ou_james'))).lists).toEqual([]);
    expect(
      (await run(reacted('cmt_2', 'ou_sarah'), { muted: { 'post:pst_1': ['ou_james'] } })).lists,
    ).toEqual([]);
  });

  it('files a reaction on an activity comment in the org', async () => {
    const { lists } = await run(reacted('cmt_9', 'ou_sarah'), { holders: ['ou_james'] });
    expect(lists[0]).toMatchObject({
      scope: 'org',
      display: {
        activityTitle: 'Rolling r',
        courseTitle: 'Spanish in 90 Days',
        courseId: 'crs_1',
        excerpt: 'Great lesson',
        reactorName: 'Sarah',
        reaction: '👍',
      },
    });
    expect((await run(reacted('cmt_9', 'ou_sarah'))).lists).toEqual([]);
  });
});

describe('reports', () => {
  it('tells the moderators about a reported post, not the reporter', async () => {
    const { lists } = await run(
      ready(
        discussionEvents.postReported.make({
          orgId: ORG,
          data: {
            orgId: ORG,
            id: 'flg_1',
            postId: 'pst_1',
            orgUserId: 'ou_mia',
            reason: 'spam',
            resolvedAt: null,
            resolution: null,
            resolvedBy: null,
            createdAt: T,
            updatedAt: T,
            communityId: 'cmy_1',
          },
        }),
        { actorOrgUserId: 'ou_mia' },
      ),
    );
    expect(lists[0]).toMatchObject({
      type: 'content.flagged',
      scope: 'space',
      subject: { type: 'post', id: 'pst_1' },
      display: { spaceName: 'Practice', excerpt: 'Listen to this, Emma', reason: 'spam' },
    });
    expect(people(lists[0])).toEqual({ ou_olivia: ['moderator'] });
  });

  const commentFlag = (commentId: string, communityId: string | null) =>
    ready(
      discussionEvents.commentReported.make({
        orgId: ORG,
        data: {
          id: 'cfl_1',
          orgId: ORG,
          commentId,
          orgUserId: 'ou_emma',
          reason: 'rude',
          resolvedAt: null,
          resolution: null,
          resolvedBy: null,
          createdAt: T,
          updatedAt: T,
          communityId,
        },
      }),
    );

  it('tells the moderators about a reported comment on a post', async () => {
    const { lists } = await run(commentFlag('cmt_2', 'cmy_1'));
    expect(lists[0]).toMatchObject({
      type: 'content.flagged',
      scope: 'space',
      subject: { type: 'comment', id: 'cmt_2' },
      parent: { type: 'post', id: 'pst_1' },
      display: { spaceName: 'Practice', excerpt: 'Nice one Noah', reason: 'rude' },
    });
    expect(people(lists[0])).toEqual({ ou_mia: ['moderator'], ou_olivia: ['moderator'] });
  });

  it('tells staff about a reported activity comment, the reporter excluded', async () => {
    const { lists } = await run(commentFlag('cmt_9', null), { staff: ['ou_olivia', 'ou_emma'] });
    expect(lists[0]).toMatchObject({
      type: 'content.flagged',
      scope: 'org',
      display: {
        activityTitle: 'Rolling r',
        courseTitle: 'Spanish in 90 Days',
        courseId: 'crs_1',
        excerpt: 'Great lesson',
        reason: 'rude',
      },
    });
    expect(people(lists[0])).toEqual({ ou_olivia: ['staff'] });
  });

  it('tells staff about a reported message', async () => {
    const { lists } = await run(
      ready(
        discussionEvents.messageReported.make({
          orgId: ORG,
          data: {
            orgId: ORG,
            id: 'mfl_1',
            communityId: 'cmy_1',
            messageId: 'msg_1',
            orgUserId: 'ou_emma',
            reason: 'spam',
            resolvedAt: null,
            resolution: null,
            resolvedBy: null,
            createdAt: T,
            updatedAt: T,
          },
        }),
        { actorOrgUserId: 'ou_emma' },
      ),
      { staff: ['ou_olivia', 'ou_emma'] },
    );
    expect(lists).toEqual([
      expect.objectContaining({
        type: 'message.flagged',
        scope: 'chat',
        subject: { type: 'message', id: 'msg_1' },
        parent: { type: 'chat', id: 'cht_1' },
        display: { reason: 'spam' },
      }),
    ]);
    expect(people(lists[0])).toEqual({ ou_olivia: ['staff'] });
  });
});

describe('chat events', () => {
  const sent = (chatStatus: string, mentioned = ['ou_emma']) =>
    ready(
      discussionEvents.messageSent.make({
        orgId: ORG,
        data: { ...MESSAGE, mentionedOrgUserIds: mentioned },
      }),
      { actorOrgUserId: 'ou_james', chatStatus },
    );

  it('lists the participants who stay in the chat, and the mentioned', async () => {
    const { lists } = await run(sent('open'), {
      participants: [
        { orgUserId: 'ou_james', leftAt: null },
        { orgUserId: 'ou_sarah', leftAt: null },
        { orgUserId: 'ou_emma', leftAt: null },
        { orgUserId: 'ou_noah', leftAt: T },
        { orgUserId: 'ou_mia', leftAt: null },
        { orgUserId: 'ou_olivia', leftAt: null },
      ],
      blocked: ['ou_mia'],
      members: ['ou_james', 'ou_sarah', 'ou_emma', 'ou_noah', 'ou_mia'],
      muted: { 'chat:cht_1': ['ou_emma'] },
    });
    expect(lists.map((list) => list.type)).toEqual(['message.sent', 'mention']);
    expect(lists[0]).toMatchObject({
      scope: 'chat',
      actorOrgUserId: 'ou_james',
      communityId: 'cmy_1',
      subject: { type: 'message', id: 'msg_1' },
      parent: { type: 'chat', id: 'cht_1' },
      display: {
        senderName: 'James',
        chatTitle: 'James, Sarah, Emma, Mia, Olivia',
        excerpt: 'Hola Emma',
        count: '1',
        summary: '1 new message',
      },
    });
    expect(people(lists[0])).toEqual({ ou_sarah: ['participant'] });
    expect(people(lists[1])).toEqual({ ou_emma: ['mentioned'] });
  });

  it('keeps left and blocked people off a chat mention', async () => {
    const { lists } = await run(sent('open', ['ou_noah', 'ou_emma']), { blocked: ['ou_emma'] });
    expect(byType(lists, 'mention')).toBeUndefined();
  });

  it('titles a direct chat with the sender', async () => {
    const { lists } = await run(sent('open'), { chatKind: 'direct' });
    expect(lists[0]?.display.chatTitle).toBe('James');
    expect(lists[1]?.display).toEqual({
      authorName: 'James',
      excerpt: 'Hola Emma',
      chatTitle: 'James',
    });
  });

  it('notifies nobody about a message in a pending chat', async () => {
    expect((await run(sent('pending'))).lists).toEqual([]);
  });

  it('mentions the people an edit newly mentions, not in a pending chat', async () => {
    const edited = (chatStatus: string) =>
      ready(
        discussionEvents.messageUpdated.make({
          orgId: ORG,
          data: { ...MESSAGE, mentionedOrgUserIds: ['ou_sarah'] },
        }),
        { actorOrgUserId: 'ou_james', chatStatus },
      );
    expect(people((await run(edited('open'))).lists[0])).toEqual({ ou_sarah: ['mentioned'] });
    expect((await run(edited('pending'))).lists).toEqual([]);
  });

  it('tells the message author about a reaction unless they muted the chat', async () => {
    const reacted = ready(
      discussionEvents.messageReactionAdded.make({
        orgId: ORG,
        data: {
          messageId: 'msg_1',
          chatId: 'cht_1',
          communityId: 'cmy_1',
          orgUserId: 'ou_james',
          reaction: '❤️',
        },
      }),
    );
    const { lists } = await run(reacted);
    expect(lists[0]).toMatchObject({
      type: 'message.reacted',
      display: { excerpt: 'See you', reactorName: 'James', reaction: '❤️' },
    });
    expect(people(lists[0])).toEqual({ ou_sarah: ['message_author'] });
    expect((await run(reacted, { muted: { 'chat:cht_1': ['ou_sarah'] } })).lists).toEqual([]);
  });

  const chat = (kind: 'direct' | 'group', status: 'pending' | 'open') =>
    ready(
      discussionEvents.chatCreated.make({
        orgId: ORG,
        data: {
          orgId: ORG,
          id: 'cht_1',
          communityId: 'cmy_1',
          kind,
          status,
          createdBy: 'ou_james',
          lockedAt: null,
          lockedBy: null,
          createdAt: T,
          updatedAt: T,
          participantIds: ['ou_james', 'ou_sarah'],
        },
      }),
      { actorOrgUserId: 'ou_james' },
    );

  it('sends a request for a pending direct chat only', async () => {
    const world: World = {
      participants: [
        { orgUserId: 'ou_james', leftAt: null },
        { orgUserId: 'ou_sarah', leftAt: null },
      ],
    };
    const { lists } = await run(chat('direct', 'pending'), world);
    expect(lists).toEqual([
      expect.objectContaining({
        type: 'chat.request',
        subject: { type: 'chat', id: 'cht_1' },
        display: { senderName: 'James', excerpt: 'Can we practise? Sarah' },
      }),
    ]);
    expect(people(lists[0])).toEqual({ ou_sarah: ['participant'] });
    expect((await run(chat('direct', 'open'), world)).lists).toEqual([]);
    expect((await run(chat('group', 'pending'), world)).lists).toEqual([]);
    expect(
      (await run(chat('direct', 'pending'), { ...world, blocked: ['ou_sarah'] })).lists,
    ).toEqual([]);
  });

  it('tells a person they were added to a chat, even when they muted it', async () => {
    const { lists } = await run(
      ready(
        discussionEvents.chatParticipantAdded.make({
          orgId: ORG,
          data: {
            chatId: 'cht_1',
            communityId: 'cmy_1',
            orgUserId: 'ou_emma',
            addedBy: 'ou_james',
          },
        }),
        { actorOrgUserId: 'ou_james' },
      ),
      { muted: { 'chat:cht_1': ['ou_emma'] } },
    );
    expect(lists[0]).toMatchObject({
      type: 'chat.added',
      display: { adderName: 'James', participantNames: ['James', 'Sarah', 'Emma'] },
    });
    expect(people(lists[0])).toEqual({ ou_emma: ['subject'] });
  });
});

describe('discussion.digest.due', () => {
  const due = ready(
    discussionEvents.digestDue.make({
      orgId: ORG,
      data: {
        communityId: 'cmy_1',
        from: new Date('2026-10-29T06:00:00Z'),
        to: new Date('2026-11-05T06:00:00Z'),
      },
    }),
  );

  it('returns one list per set of spaces a member can open, with only those posts', async () => {
    const { lists } = await run(due, {
      members: ['ou_sarah', 'ou_james', 'ou_emma', 'ou_noah'],
      openers: {
        spc_news: ['ou_sarah', 'ou_james', 'ou_emma'],
        spc_speaking: ['ou_sarah', 'ou_james'],
      },
      posts: [
        { postId: 'pst_1', spaceId: 'spc_news', title: 'Welcome' },
        { postId: 'pst_2', spaceId: 'spc_speaking', title: 'Find a partner' },
      ],
    });
    expect(lists).toHaveLength(2);
    expect(lists[0]).toMatchObject({
      type: 'digest',
      scope: 'community',
      communityId: 'cmy_1',
      subject: { type: 'community', id: 'cmy_1' },
      display: {
        communityTitle: 'Spring cohort',
        from: '2026-10-29T06:00:00.000Z',
        to: '2026-11-05T06:00:00.000Z',
        posts: [
          {
            postId: 'pst_1',
            title: 'Welcome',
            authorName: 'Sarah',
            spaceName: 'Announcements',
            commentCount: 2,
          },
          {
            postId: 'pst_2',
            title: 'Find a partner',
            authorName: 'Sarah',
            spaceName: 'Speaking partners',
            commentCount: 2,
          },
        ],
      },
    });
    expect(people(lists[0])).toEqual({
      ou_sarah: ['community_member'],
      ou_james: ['community_member'],
    });
    expect(lists[1]?.display.posts).toEqual([expect.objectContaining({ postId: 'pst_1' })]);
    expect(people(lists[1])).toEqual({ ou_emma: ['community_member'] });
  });

  it('leaves out the posts in spaces a member muted, and the member when nothing is left', async () => {
    const { lists, muted } = await run(due, {
      members: ['ou_sarah', 'ou_james', 'ou_emma'],
      openers: {
        spc_news: ['ou_sarah', 'ou_james', 'ou_emma'],
        spc_speaking: ['ou_sarah', 'ou_james'],
      },
      muted: { 'space:spc_speaking': ['ou_james'], 'space:spc_news': ['ou_emma'] },
      posts: [
        { postId: 'pst_1', spaceId: 'spc_news', title: 'Welcome' },
        { postId: 'pst_2', spaceId: 'spc_speaking', title: 'Find a partner' },
      ],
    });
    expect(lists).toHaveLength(2);
    expect(people(lists[0])).toEqual({ ou_sarah: ['community_member'] });
    expect(lists[0]?.display.posts).toHaveLength(2);
    expect(people(lists[1])).toEqual({ ou_james: ['community_member'] });
    expect(lists[1]?.display.posts).toEqual([expect.objectContaining({ postId: 'pst_1' })]);
    expect(muted).toHaveBeenCalledWith(
      ORG,
      { type: 'space', id: 'spc_speaking' },
      ['ou_sarah', 'ou_james'],
      new Date(due.occurredAt),
    );
  });

  it('sends nothing for a window with no posts', async () => {
    expect((await run(due, { posts: [] })).lists).toEqual([]);
  });
});
