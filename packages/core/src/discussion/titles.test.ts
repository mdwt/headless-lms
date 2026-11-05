import { describe, expect, it, vi } from 'vitest';
import type { Activity, Comment, Message } from '../types/index.js';
import { actorWith } from '../organizations/index.js';
import { DiscussionItemTitles } from './titles.js';

const AT = new Date('2026-11-01T09:00:00Z');

function comment(over: Partial<Comment>): Comment {
  return {
    id: 'cmt_1',
    orgId: 'org_1',
    activityId: null,
    postId: 'pst_1',
    communityId: 'cmy_1',
    parentId: null,
    orgUserId: 'ou_james',
    body: 'Your rolled r is much better, <@ou_sarah>',
    status: 'published',
    removedBy: null,
    createdAt: AT,
    updatedAt: AT,
    ...over,
  };
}

function message(over: Partial<Message>): Message {
  return {
    orgId: 'org_1',
    id: 'msg_1',
    communityId: 'cmy_1',
    chatId: 'cht_1',
    orgUserId: 'ou_james',
    body: 'See you   at nine',
    replyToId: null,
    editedAt: null,
    deletedAt: null,
    createdAt: AT,
    updatedAt: AT,
    ...over,
  };
}

const activity: Activity = {
  orgId: 'org_1',
  id: 'act_1',
  moduleId: 'mod_1',
  courseId: 'crs_1',
  seq: 0,
  settings: { title: 'Lesson 3' },
  createdAt: AT,
  updatedAt: AT,
};

function titles(over: { courseAccess?: boolean } = {}) {
  const comments: Record<string, Comment> = {
    cmt_1: comment({}),
    cmt_hidden: comment({ id: 'cmt_hidden', postId: 'pst_hidden' }),
    cmt_removed: comment({ id: 'cmt_removed', status: 'removed' }),
    cmt_pending: comment({ id: 'cmt_pending', status: 'pending', orgUserId: 'ou_sarah' }),
    cmt_lesson: comment({ id: 'cmt_lesson', postId: null, activityId: 'act_1', communityId: null }),
    cmt_lesson_held: comment({
      id: 'cmt_lesson_held',
      postId: null,
      activityId: 'act_1',
      communityId: null,
      status: 'pending',
    }),
  };
  const messages: Record<string, Message> = {
    msg_1: message({}),
    msg_deleted: message({ id: 'msg_deleted', deletedAt: AT }),
    msg_other: message({ id: 'msg_other', chatId: 'cht_other' }),
  };
  const visibleTitles = vi.fn(async (ids: string[], _a: unknown) =>
    Object.fromEntries(ids.filter((id) => id === 'pst_1').map((id) => [id, 'My first recording'])),
  );
  const titlesFor = vi.fn(async (ids: string[], _a: unknown) =>
    Object.fromEntries(ids.filter((id) => id === 'cht_1').map((id) => [id, 'James'])),
  );
  const hasAccess = vi.fn(async () => over.courseAccess ?? false);
  return {
    hasAccess,
    service: new DiscussionItemTitles({
      posts: { visibleTitles },
      chats: { titlesFor },
      comments: { findComment: async (_o, id) => comments[id] ?? null },
      messages: { findMessage: async (_o, id) => messages[id] ?? null },
      profiles: {
        authorsOf: async () => ({
          ou_sarah: {
            id: 'ou_sarah',
            firstName: 'Sarah',
            lastName: null,
            email: 'sarah@example.com',
            displayName: null,
            headline: null,
            image: null,
            imageAssetOrgId: null,
            imageAssetId: null,
          },
        }),
      },
      activities: { getActivity: async (id) => (id === 'act_1' ? activity : null) },
      access: { hasAccess },
      actors: { systemActor: (orgId) => actorWith({ owner: true, id: 'system', orgId }) },
    }),
  };
}

const sarah = actorWith({ id: 'ou_sarah', orgId: 'org_1' });

describe('DiscussionItemTitles', () => {
  it('returns only the posts, chats, comments and messages the person can open', async () => {
    const { service } = titles();
    const result = await service.titlesFor(
      [
        { type: 'post', id: 'pst_1' },
        { type: 'post', id: 'pst_hidden' },
        { type: 'chat', id: 'cht_1' },
        { type: 'chat', id: 'cht_other' },
        { type: 'comment', id: 'cmt_1' },
        { type: 'comment', id: 'cmt_hidden' },
        { type: 'comment', id: 'cmt_removed' },
        { type: 'comment', id: 'cmt_pending' },
        { type: 'comment', id: 'cmt_missing' },
        { type: 'message', id: 'msg_1' },
        { type: 'message', id: 'msg_deleted' },
        { type: 'message', id: 'msg_other' },
        { type: 'course', id: 'crs_1' },
      ],
      sarah,
    );
    expect(result).toEqual({
      'post:pst_1': { title: 'My first recording' },
      'chat:cht_1': { title: 'James' },
      'comment:cmt_1': {
        title: 'My first recording',
        excerpt: 'Your rolled r is much better, @Sarah',
      },
      'comment:cmt_pending': {
        title: 'My first recording',
        excerpt: 'Your rolled r is much better, @Sarah',
      },
      'message:msg_1': { title: 'James', excerpt: 'See you at nine' },
    });
  });

  it('shows removed post comments to a holder of communities:moderate on that community only', async () => {
    const { service } = titles();
    const emma = actorWith({
      id: 'ou_emma',
      orgId: 'org_1',
      content: { cmy_1: ['communities:moderate'] },
    });
    const elsewhere = actorWith({
      id: 'ou_mod',
      orgId: 'org_1',
      content: { cmy_2: ['communities:moderate'] },
    });
    const courseOnly = actorWith({
      id: 'ou_james',
      orgId: 'org_1',
      org: ['courses:moderate'],
    });
    const refs = [{ type: 'comment' as const, id: 'cmt_removed' }];
    expect(Object.keys(await service.titlesFor(refs, emma))).toEqual(['comment:cmt_removed']);
    expect(await service.titlesFor(refs, elsewhere)).toEqual({});
    expect(await service.titlesFor(refs, courseOnly)).toEqual({});
  });

  it('shows a held lesson comment to a holder of courses:moderate on its course only', async () => {
    const { service } = titles();
    const refs = [{ type: 'comment' as const, id: 'cmt_lesson_held' }];
    const james = actorWith({
      id: 'ou_james',
      orgId: 'org_1',
      content: { crs_1: ['courses:moderate'] },
    });
    const other = actorWith({
      id: 'ou_other',
      orgId: 'org_1',
      content: { crs_2: ['courses:moderate'] },
    });
    expect(Object.keys(await service.titlesFor(refs, james))).toEqual(['comment:cmt_lesson_held']);
    expect(await service.titlesFor(refs, other)).toEqual({});
    expect(await service.titlesFor(refs, sarah)).toEqual({});
  });

  it('titles a comment on a course activity only for someone who can open the course', async () => {
    const closed = titles();
    await expect(
      closed.service.titlesFor([{ type: 'comment', id: 'cmt_lesson' }], sarah),
    ).resolves.toEqual({});
    expect(closed.hasAccess).toHaveBeenCalledWith('org_1', 'ou_sarah', 'crs_1');
    const open = titles({ courseAccess: true });
    await expect(
      open.service.titlesFor([{ type: 'comment', id: 'cmt_lesson' }], sarah),
    ).resolves.toEqual({
      'comment:cmt_lesson': { title: 'Lesson 3', excerpt: 'Your rolled r is much better, @Sarah' },
    });
    const reader = titles();
    await expect(
      reader.service.titlesFor(
        [{ type: 'comment', id: 'cmt_lesson' }],
        actorWith({ id: 'ou_james', orgId: 'org_1', content: { crs_1: ['courses:read'] } }),
      ),
    ).resolves.toHaveProperty(['comment:cmt_lesson']);
    expect(reader.hasAccess).not.toHaveBeenCalled();
  });
});
