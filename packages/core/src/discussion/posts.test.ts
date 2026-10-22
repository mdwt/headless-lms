import { describe, expect, it } from 'vitest';
import { ConflictError, ForbiddenError, NotFoundError } from '../shared/errors.js';
import type { Actor } from '../shared/actor.js';
import type { SpaceDetail } from '../content/index.js';
import type { NewDomainEvent } from '../shared/ports.js';
import { PostServiceImpl } from './posts.js';
import type { CommunityAccessReader } from '../entitlements/index.js';
import type { ImageOwnerReader } from '../assets/index.js';
import type {
  AuthorRoleReader,
  CreatePostInput,
  FeedQuery,
  PostCommentFlagReader,
  PostReactions,
  PostRepository,
  PostUnitOfWork,
} from './ports.js';
import type { CommentReport, Page, Post, PostFlag, Role } from '../types/index.js';

const AT = new Date('2026-10-21T12:00:00.000Z');
const ORG = 'org-1';

const member: Actor = { id: 'ou_member', role: 'student' };
const other: Actor = { id: 'ou_other', role: 'student' };
const moderator: Actor = { id: 'ou_mod', role: 'moderator' };
const staff: Actor = { id: 'ou_staff', role: 'instructor' };
const outsider: Actor = { id: 'ou_out', role: 'student' };

function space(over: Partial<SpaceDetail> = {}): SpaceDetail {
  return {
    orgId: ORG,
    id: 'spc_1',
    communityId: 'cmy_1',
    name: 'Announcements',
    description: '',
    seq: 0,
    accessRule: 'all_members',
    capacity: null,
    settings: { comments: true, reactions: true, requireReview: false },
    topics: [],
    links: [],
    createdAt: AT,
    updatedAt: AT,
    ...over,
  };
}

function draftInput(over: Partial<CreatePostInput> = {}): CreatePostInput {
  return {
    spaceId: 'spc_1',
    title: 'Hello',
    body: 'Body',
    topicId: null,
    extra: {},
    coverAssetId: null,
    mode: 'submit',
    scheduledAt: null,
    ...over,
  };
}

const feed: FeedQuery = { page: 1, pageSize: 20 };

function harness(options?: {
  open?: boolean;
  spaces?: SpaceDetail[];
  roles?: Record<string, Role>;
  images?: ImageOwnerReader;
}) {
  const rows: Post[] = [];
  const flags: PostFlag[] = [];
  const commentFlagRows: { spaceId: string; flag: CommentReport }[] = [];
  const followed = new Set<string>();
  const reactions: { postId: string; orgUserId: string; emoji: string }[] = [];
  let current = options?.spaces ?? [space()];
  const calls: NewDomainEvent[][] = [];

  const repo: PostRepository = {
    async insert(_orgId, post) {
      rows.push({ ...post });
      return { ...post };
    },
    async update(orgId, id, patch) {
      const post = rows.find((row) => row.orgId === orgId && row.id === id);
      if (!post) {
        return null;
      }
      Object.assign(post, patch, { updatedAt: new Date() });
      return { ...post };
    },
    async find(orgId, id) {
      const post = rows.find((row) => row.orgId === orgId && row.id === id);
      return post ? { ...post } : null;
    },
    async listPublished(orgId, spaceIds, query) {
      const matched = rows
        .filter(
          (row) =>
            row.orgId === orgId &&
            row.status === 'published' &&
            spaceIds.includes(row.spaceId) &&
            (query.topicId === undefined || row.topicId === query.topicId),
        )
        .sort((a, b) => {
          if (a.pinned !== b.pinned) {
            return a.pinned ? -1 : 1;
          }
          const at = (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0);
          if (at !== 0) {
            return at;
          }
          return a.id < b.id ? 1 : -1;
        });
      const start = (query.page - 1) * query.pageSize;
      const page: Page<Post> = {
        rows: matched.slice(start, start + query.pageSize).map((row) => ({ ...row })),
        total: matched.length,
        page: query.page,
        pageSize: query.pageSize,
      };
      return page;
    },
    async listPending(orgId, spaceId) {
      return rows
        .filter((row) => row.orgId === orgId && row.spaceId === spaceId && row.status === 'pending')
        .map((row) => ({ ...row }));
    },
    async listDue(orgId, now) {
      return rows
        .filter(
          (row) =>
            row.orgId === orgId &&
            row.status === 'scheduled' &&
            row.scheduledAt !== null &&
            row.scheduledAt <= now,
        )
        .map((row) => ({ ...row }));
    },
    async reactionsOf(_orgId, postId, viewerId) {
      const counts: PostReactions = { reactions: {} };
      for (const reaction of reactions) {
        if (reaction.postId !== postId) {
          continue;
        }
        counts.reactions[reaction.emoji] = (counts.reactions[reaction.emoji] ?? 0) + 1;
        if (reaction.orgUserId === viewerId) {
          counts.viewerReaction = reaction.emoji;
        }
      }
      return counts;
    },
    async setReaction(_orgId, postId, orgUserId, emoji) {
      const index = reactions.findIndex(
        (reaction) => reaction.postId === postId && reaction.orgUserId === orgUserId,
      );
      if (index >= 0) {
        reactions.splice(index, 1);
      }
      if (emoji !== null) {
        reactions.push({ postId, orgUserId, emoji });
      }
    },
    async follow(_orgId, postId, orgUserId) {
      followed.add(`${postId}:${orgUserId}`);
    },
    async followerIds() {
      return [];
    },
    async unfollow(_orgId, postId, orgUserId) {
      followed.delete(`${postId}:${orgUserId}`);
    },
    async bookmark() {},
    async unbookmark() {},
    async insertFlag(_orgId, flag) {
      if (flags.some((row) => row.postId === flag.postId && row.orgUserId === flag.orgUserId)) {
        return null;
      }
      flags.push({ ...flag });
      return { ...flag };
    },
    async listOpenFlags(orgId, spaceId) {
      const postIds = new Set(
        rows.filter((row) => row.orgId === orgId && row.spaceId === spaceId).map((row) => row.id),
      );
      return flags
        .filter((flag) => flag.orgId === orgId && postIds.has(flag.postId) && !flag.resolvedAt)
        .map((flag) => ({ ...flag }));
    },
    async resolveFlags(orgId, postId, resolved) {
      for (const flag of flags) {
        if (flag.orgId === orgId && flag.postId === postId && !flag.resolvedAt) {
          flag.resolvedAt = resolved.resolvedAt;
          flag.resolvedBy = resolved.resolvedBy;
          flag.resolution = resolved.resolution;
        }
      }
    },
  };

  const access: CommunityAccessReader = {
    async isCommunityMember() {
      return true;
    },
    async canOpenSpace(_orgId, actor) {
      if (options?.open === false) {
        return false;
      }
      return actor.id !== outsider.id;
    },
    async openSpaceIds(_orgId, actor) {
      if (actor.id === outsider.id) {
        return [];
      }
      return current.map((item) => item.id);
    },
    async grantOpensCommunity() {
      return false;
    },
  };

  const commentFlags: PostCommentFlagReader = {
    async listOpenFlagsForSpace(orgId, spaceId) {
      return commentFlagRows
        .filter(
          (row) =>
            row.flag.orgId === orgId && row.spaceId === spaceId && row.flag.resolvedAt === null,
        )
        .map((row) => ({ ...row.flag }));
    },
  };

  const authors: AuthorRoleReader = {
    async roleOf(_orgId, orgUserId) {
      return options?.roles?.[orgUserId] ?? null;
    },
  };

  const uow: PostUnitOfWork = {
    run: (fn) =>
      fn({
        posts: repo,
        outbox: {
          async append(events: NewDomainEvent[]) {
            calls.push(events);
          },
        },
      }),
  };

  const svc = new PostServiceImpl({
    repo,
    access,
    content: {
      async getSpace(_orgId, spaceId) {
        return current.find((item) => item.id === spaceId) ?? null;
      },
      async listSpaces() {
        return current;
      },
      async getDmSettings() {
        return null;
      },
    },
    authors,
    commentFlags,
    images: options?.images ?? { ownsImage: async () => true },
    uow,
  });

  return {
    svc,
    rows,
    flags,
    commentFlagRows,
    calls,
    followed,
    setSpaces(next: SpaceDetail[]) {
      current = next;
    },
  };
}

describe('posts', () => {
  it('publishes a member post outright when the space does not require review', async () => {
    const { svc, calls } = harness();
    const post = await svc.create(ORG, member, draftInput());
    expect(post.status).toBe('published');
    expect(post.publishedAt).toBeInstanceOf(Date);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.map((event) => event.type)).toEqual([
      'discussion.post.created',
      'discussion.post.published',
    ]);
    expect(calls[0]?.[0]?.metadata).toEqual({ actorOrgUserId: member.id });
    expect(calls[0]?.[1]?.metadata).toEqual({ actorOrgUserId: member.id, previousStatus: null });
  });

  it('sends a member post to pending when the space requires review', async () => {
    const { svc, calls, setSpaces } = harness();
    setSpaces([space({ settings: { comments: true, reactions: true, requireReview: true } })]);
    const post = await svc.create(ORG, member, draftInput());
    expect(post.status).toBe('pending');
    expect(calls[0]?.map((event) => event.type)).toEqual(['discussion.post.created']);
    expect(calls[0]?.[0]?.metadata).toEqual({ actorOrgUserId: member.id, previousStatus: null });
  });

  it('publishes a staff post without review', async () => {
    const { svc, setSpaces } = harness();
    setSpaces([space({ settings: { comments: true, reactions: true, requireReview: true } })]);
    const post = await svc.create(ORG, staff, draftInput());
    expect(post.status).toBe('published');
  });

  it('sends a moderator post to review because a moderator is not staff', async () => {
    const { svc, setSpaces } = harness();
    setSpaces([space({ settings: { comments: true, reactions: true, requireReview: true } })]);
    const post = await svc.create(ORG, moderator, draftInput());
    expect(post.status).toBe('pending');
  });

  it('rejects a topic that is not on the space and requires one when the space has topics', async () => {
    const { svc, setSpaces } = harness();
    const topic = {
      orgId: ORG,
      id: 'top_1',
      spaceId: 'spc_1',
      name: 'Welcome',
      seq: 0,
      createdAt: AT,
      updatedAt: AT,
    };
    setSpaces([space({ topics: [topic] })]);
    await expect(svc.create(ORG, member, draftInput())).rejects.toBeInstanceOf(ConflictError);
    await expect(
      svc.create(ORG, member, draftInput({ topicId: 'top_missing' })),
    ).rejects.toBeInstanceOf(NotFoundError);
    const post = await svc.create(ORG, member, draftInput({ topicId: 'top_1' }));
    expect(post.topicId).toBe('top_1');
  });

  it('refuses a post in a space the person cannot open', async () => {
    const { svc, calls } = harness();
    await expect(svc.create(ORG, outsider, draftInput())).rejects.toBeInstanceOf(ForbiddenError);
    expect(calls).toHaveLength(0);
  });

  it('lets only the author edit, and a pending edit says it was already pending', async () => {
    const { svc, calls, setSpaces } = harness();
    setSpaces([space({ settings: { comments: true, reactions: true, requireReview: true } })]);
    const created = await svc.create(ORG, member, draftInput());
    await expect(svc.update(ORG, created.id, staff, { title: 'Nope' })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    const edited = await svc.update(ORG, created.id, member, { title: 'Revised' });
    expect(edited.title).toBe('Revised');
    expect(edited.status).toBe('pending');
    const updated = calls.at(-1)?.[0];
    expect(updated?.type).toBe('discussion.post.updated');
    expect(updated?.metadata).toEqual({ actorOrgUserId: member.id, previousStatus: 'pending' });
  });

  it('does not mark a published edit with a previous status', async () => {
    const { svc, calls } = harness();
    const created = await svc.create(ORG, member, draftInput());
    await svc.update(ORG, created.id, member, { body: 'More' });
    expect(calls.at(-1)?.[0]?.metadata).toEqual({ actorOrgUserId: member.id });
  });

  it('approves a pending post as a moderator and publishes it from review', async () => {
    const { svc, calls, setSpaces } = harness();
    setSpaces([space({ settings: { comments: true, reactions: true, requireReview: true } })]);
    const created = await svc.create(ORG, member, draftInput());
    await expect(svc.approve(ORG, created.id, member)).rejects.toBeInstanceOf(ForbiddenError);
    const approved = await svc.approve(ORG, created.id, moderator);
    expect(approved.status).toBe('published');
    expect(calls.at(-1)?.map((event) => event.type)).toEqual(['discussion.post.published']);
    expect(calls.at(-1)?.[0]?.metadata).toEqual({
      actorOrgUserId: moderator.id,
      previousStatus: 'pending',
    });
  });

  it('lets the author remove their post and a moderator remove anyone', async () => {
    const { svc, calls, flags } = harness();
    const created = await svc.create(ORG, member, draftInput());
    await svc.flag(ORG, created.id, other, 'spam');
    await expect(svc.remove(ORG, created.id, other)).rejects.toBeInstanceOf(ForbiddenError);
    const removed = await svc.remove(ORG, created.id, member);
    expect(removed.status).toBe('removed');
    expect(removed.removedBy).toBe(member.id);
    expect(flags[0]).toMatchObject({ resolution: 'removed', resolvedBy: member.id });
    expect(calls.at(-1)?.[0]).toMatchObject({
      type: 'discussion.post.removed',
      metadata: { actorOrgUserId: member.id, previousStatus: 'published' },
    });
  });

  it('refuses to schedule a post that is awaiting review', async () => {
    const { svc, setSpaces } = harness();
    setSpaces([space({ settings: { comments: true, reactions: true, requireReview: true } })]);
    const created = await svc.create(ORG, member, draftInput());
    expect(created.status).toBe('pending');
    await expect(
      svc.schedule(ORG, created.id, member, new Date('2026-10-22T08:00:00.000Z')),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('restores a removed post to published', async () => {
    const { svc } = harness();
    const created = await svc.create(ORG, member, draftInput({ mode: 'draft' }));
    const removed = await svc.remove(ORG, created.id, member);
    const restored = await svc.restore(ORG, removed.id, staff);
    expect(restored.status).toBe('published');
    expect(restored.removedBy).toBeNull();
    expect(restored.publishedAt).toBeInstanceOf(Date);
  });

  it('lets a moderator pin and close comments, and refuses a member', async () => {
    const { svc, calls } = harness();
    const created = await svc.create(ORG, member, draftInput());
    await expect(svc.pin(ORG, created.id, member)).rejects.toBeInstanceOf(ForbiddenError);
    const pinned = await svc.pin(ORG, created.id, moderator);
    expect(pinned.pinned).toBe(true);
    const closed = await svc.closeComments(ORG, created.id, moderator);
    expect(closed.commentsClosed).toBe(true);
    expect(calls.at(-1)?.[0]?.type).toBe('discussion.post.updated');
  });

  it('hides drafts from other members and serves the published feed pinned first', async () => {
    const { svc, rows } = harness();
    const draft = await svc.create(ORG, member, draftInput({ mode: 'draft', title: 'Draft' }));
    await expect(svc.getPost(ORG, other, draft.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(svc.getPost(ORG, member, draft.id)).resolves.toMatchObject({ title: 'Draft' });
    const older = await svc.create(ORG, member, draftInput({ title: 'Older' }));
    const newer = await svc.create(ORG, member, draftInput({ title: 'Newer' }));
    const olderRow = rows.find((row) => row.id === older.id);
    const newerRow = rows.find((row) => row.id === newer.id);
    if (olderRow?.publishedAt && newerRow?.publishedAt) {
      olderRow.publishedAt = new Date('2026-10-01T00:00:00.000Z');
      newerRow.publishedAt = new Date('2026-10-20T00:00:00.000Z');
      newerRow.pinned = true;
    }
    const page = await svc.spaceFeed(ORG, other, 'spc_1', feed);
    expect(page.rows.map((row) => row.title)).toEqual(['Newer', 'Older']);
    expect(page.rows.some((row) => row.id === draft.id)).toBe(false);
  });

  it('reads the member feed from the spaces the person can open', async () => {
    const { svc, setSpaces } = harness();
    setSpaces([space(), space({ id: 'spc_2', name: 'Other', seq: 1 })]);
    await svc.create(ORG, member, draftInput());
    await svc.create(ORG, member, draftInput({ spaceId: 'spc_2', title: 'Second' }));
    const page = await svc.memberFeed(ORG, member, 'cmy_1', feed);
    expect(page.total).toBe(2);
    const hidden = await svc.memberFeed(ORG, outsider, 'cmy_1', feed);
    expect(hidden.total).toBe(0);
  });

  it('submits a due post as its author, with no actor, and applies review when the role is missing', async () => {
    const { svc, calls, setSpaces } = harness({ roles: { ou_staff: 'owner' } });
    setSpaces([space({ settings: { comments: true, reactions: true, requireReview: true } })]);
    const when = new Date('2026-10-21T08:00:00.000Z');
    const scheduled = await svc.create(
      ORG,
      member,
      draftInput({ mode: 'schedule', scheduledAt: when }),
    );
    const staffPost = await svc.create(
      ORG,
      staff,
      draftInput({ mode: 'schedule', scheduledAt: when, title: 'Staff' }),
    );
    calls.length = 0;
    await svc.publishDue(ORG, new Date('2026-10-21T09:00:00.000Z'));
    const events = calls[0] ?? [];
    const idOf = (event: NewDomainEvent): string | undefined => {
      const data = event.data;
      if (data && typeof data === 'object' && 'id' in data && typeof data.id === 'string') {
        return data.id;
      }
      return undefined;
    };
    const memberEvent = events.find((event) => idOf(event) === scheduled.id);
    const staffEvent = events.find((event) => idOf(event) === staffPost.id);
    expect(memberEvent).toMatchObject({
      type: 'discussion.post.updated',
      metadata: { previousStatus: 'scheduled' },
    });
    expect(memberEvent?.metadata).not.toHaveProperty('actorOrgUserId');
    expect(staffEvent).toMatchObject({
      type: 'discussion.post.published',
      metadata: { previousStatus: 'scheduled' },
    });
    expect(staffEvent?.metadata).not.toHaveProperty('actorOrgUserId');
  });

  it('flags a visible post once and lets a moderator resolve the flag without an event', async () => {
    const { svc, calls, flags } = harness();
    const created = await svc.create(ORG, member, draftInput());
    const flagged = await svc.flag(ORG, created.id, other, 'spam');
    expect(calls.at(-1)?.[0]?.type).toBe('discussion.post.reported');
    await expect(svc.flag(ORG, created.id, other, 'again')).rejects.toBeInstanceOf(ConflictError);
    const before = calls.length;
    await expect(svc.resolveFlags(ORG, created.id, other, 'dismissed')).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await svc.resolveFlags(ORG, created.id, moderator, 'dismissed');
    expect(calls).toHaveLength(before);
    expect(flags.find((flag) => flag.id === flagged.id)?.resolution).toBe('dismissed');
  });

  it('refuses a reaction when reactions are off and records a follow without an event', async () => {
    const { svc, calls, followed, setSpaces } = harness();
    setSpaces([space({ settings: { comments: true, reactions: false, requireReview: false } })]);
    const created = await svc.create(ORG, member, draftInput());
    await expect(svc.setReaction(ORG, created.id, other, '👍')).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await svc.setReactions(ORG, created.id, moderator, true);
    const counts = await svc.setReaction(ORG, created.id, other, '👍');
    expect(counts.viewerReaction).toBe('👍');
    const before = calls.length;
    await svc.follow(ORG, created.id, other);
    expect(followed.has(`${created.id}:${other.id}`)).toBe(true);
    expect(calls).toHaveLength(before);
  });

  it('shows pending posts and open flags to a moderator and refuses a member', async () => {
    const { svc, setSpaces } = harness();
    setSpaces([space({ settings: { comments: true, reactions: true, requireReview: true } })]);
    const created = await svc.create(ORG, member, draftInput());
    await svc.flag(ORG, created.id, moderator, 'check');
    await expect(svc.moderationQueue(ORG, member, 'spc_1')).rejects.toBeInstanceOf(ForbiddenError);
    const queue = await svc.moderationQueue(ORG, moderator, 'spc_1');
    expect(queue.pending.map((post) => post.id)).toEqual([created.id]);
    expect(queue.flags).toHaveLength(1);
    expect(queue.commentFlags).toEqual([]);
  });

  it('includes open comment flags on that space and leaves resolved and other spaces out', async () => {
    const { svc, commentFlagRows } = harness();
    const open: CommentReport = {
      id: 'crp_open',
      orgId: ORG,
      commentId: 'cmt_1',
      orgUserId: other.id,
      reason: 'spam',
      resolvedAt: null,
      resolution: null,
      resolvedBy: null,
      createdAt: AT,
      updatedAt: AT,
    };
    commentFlagRows.push(
      { spaceId: 'spc_1', flag: open },
      {
        spaceId: 'spc_1',
        flag: {
          ...open,
          id: 'crp_resolved',
          resolvedAt: AT,
          resolution: 'dismissed',
          resolvedBy: moderator.id,
        },
      },
      { spaceId: 'spc_2', flag: { ...open, id: 'crp_other', commentId: 'cmt_2' } },
    );
    const queue = await svc.moderationQueue(ORG, moderator, 'spc_1');
    expect(queue.commentFlags.map((flag) => flag.id)).toEqual(['crp_open']);
  });

  it('refuses a cover the author did not upload', async () => {
    const { svc } = harness({ images: { ownsImage: async () => false } });
    await expect(
      svc.create(ORG, member, draftInput({ coverAssetId: 'ast_paid' })),
    ).rejects.toBeInstanceOf(NotFoundError);
    const created = await svc.create(ORG, member, draftInput());
    await expect(
      svc.update(ORG, created.id, member, { coverAssetId: 'ast_paid' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
