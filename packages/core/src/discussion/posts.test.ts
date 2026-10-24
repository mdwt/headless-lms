import { describe, expect, it, vi } from 'vitest';
import { ConflictError, ForbiddenError, NotFoundError } from '../shared/errors.js';
import type { Actor } from '../shared/actor.js';
import type { SpaceDetail } from '../content/index.js';
import type { NewDomainEvent } from '../shared/ports.js';
import { PostServiceImpl } from './posts.js';
import { InvalidCursorError } from './model.js';
import type { CommunityAccessReader } from '../entitlements/index.js';
import type { AssetUrlSigner, MemberImageReader } from '../assets/index.js';
import type {
  AuthorProfileReader,
  AuthorRecord,
  AuthorRoleReader,
  CreatePostInput,
  PostCommentFlagReader,
  PostFeedQuery,
  PostReactions,
  PostRepository,
  PostUnitOfWork,
} from './ports.js';
import type { CommentReport, Post, PostFlag, Role } from '../types/index.js';

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
    communityId: 'cmy_1',
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

const feed: PostFeedQuery = { limit: 20 };

function topic(id: string) {
  return { orgId: ORG, id, spaceId: 'spc_1', name: id, seq: 0, createdAt: AT, updatedAt: AT };
}

function feedOrder(a: Post, b: Post): number {
  if (a.pinned !== b.pinned) {
    return a.pinned ? -1 : 1;
  }
  const at = (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0);
  if (at !== 0) {
    return at;
  }
  return a.id < b.id ? 1 : -1;
}

function signer(unsigned: string[] = []): AssetUrlSigner {
  return {
    async urls(_orgId, assetIds) {
      return Object.fromEntries(
        assetIds.filter((id) => !unsigned.includes(id)).map((id) => [id, `signed:${id}`]),
      );
    },
    async downloads() {
      return {};
    },
  };
}

function harness(options?: {
  open?: boolean;
  spaces?: SpaceDetail[];
  roles?: Record<string, Role>;
  images?: MemberImageReader;
  profiles?: Record<string, Partial<AuthorRecord>>;
  unsigned?: string[];
}) {
  const rows: Post[] = [];
  const bookmarks: { postId: string; orgUserId: string }[] = [];
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
      const after = query.after;
      return rows
        .filter(
          (row) =>
            row.orgId === orgId &&
            row.status === 'published' &&
            spaceIds.includes(row.spaceId) &&
            (query.topicId === undefined || row.topicId === query.topicId) &&
            (after === null ||
              feedOrder(
                { ...row },
                { ...row, pinned: after.pinned, publishedAt: after.publishedAt, id: after.id },
              ) > 0),
        )
        .sort(feedOrder)
        .slice(0, query.limit)
        .map((row) => ({ ...row }));
    },
    async listByAuthor(orgId, orgUserId, spaceIds) {
      return rows
        .filter(
          (row) =>
            row.orgId === orgId && row.orgUserId === orgUserId && spaceIds.includes(row.spaceId),
        )
        .map((row) => ({ ...row }));
    },
    async listBookmarked(orgId, orgUserId, spaceIds) {
      return bookmarks
        .filter((mark) => mark.orgUserId === orgUserId)
        .flatMap((mark) => rows.filter((row) => row.id === mark.postId))
        .filter((row) => row.orgId === orgId && spaceIds.includes(row.spaceId))
        .map((row) => ({ ...row }));
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
    async hasDue(orgId, now) {
      return rows.some(
        (row) =>
          row.orgId === orgId &&
          row.status === 'scheduled' &&
          row.scheduledAt !== null &&
          row.scheduledAt <= now,
      );
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
    async bookmark(_orgId, postId, orgUserId) {
      if (!bookmarks.some((mark) => mark.postId === postId && mark.orgUserId === orgUserId)) {
        bookmarks.push({ postId, orgUserId });
      }
    },
    async unbookmark() {},
    async insertFlag(_orgId, flag) {
      if (flags.some((row) => row.postId === flag.postId && row.orgUserId === flag.orgUserId)) {
        return null;
      }
      flags.push({ ...flag });
      return { ...flag };
    },
    async findFlag(_orgId, postId, orgUserId) {
      const flag = flags.find((row) => row.postId === postId && row.orgUserId === orgUserId);
      return flag ? { ...flag } : null;
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
    async canOpen(_orgId, actor) {
      if (options?.open === false) {
        return false;
      }
      return actor.id !== outsider.id;
    },
    async communityMembersAmong(_orgId, _communityId, orgUserIds) {
      return orgUserIds.filter((id) => id !== outsider.id);
    },
    async spaceOpenersAmong(_orgId, _spaceId, orgUserIds) {
      return orgUserIds.filter((id) => id !== outsider.id);
    },
    async openSpaceIds(_orgId, actor) {
      if (actor.id === outsider.id) {
        return [];
      }
      return current.map((item) => item.id);
    },
    async openSpacesFor(_orgId, actor) {
      if (actor.id === outsider.id) {
        return [];
      }
      return current;
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
    async rolesOf(_orgId, orgUserIds) {
      const roles = options?.roles ?? {};
      return Object.fromEntries(orgUserIds.flatMap((id) => (roles[id] ? [[id, roles[id]!]] : [])));
    },
  };

  const profiles: AuthorProfileReader = {
    async authorsOf(_orgId, orgUserIds) {
      return Object.fromEntries(
        orgUserIds.map((id) => [
          id,
          {
            id,
            firstName: 'First',
            lastName: 'Last',
            email: `${id}@example.test`,
            image: null,
            role: options?.roles?.[id] ?? 'student',
            displayName: null,
            headline: null,
            imageAssetOrgId: null,
            imageAssetId: null,
            ...options?.profiles?.[id],
          },
        ]),
      );
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
    profiles,
    commentFlags,
    images: options?.images ?? { ownsImage: async () => true },
    assetUrls: signer(options?.unsigned),
    uow,
  });

  return {
    svc,
    repo,
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

  it('lets the author remove their post and leaves its flags open', async () => {
    const { svc, calls, flags } = harness();
    const created = await svc.create(ORG, member, draftInput());
    await svc.flag(ORG, created.id, other, 'spam');
    await expect(svc.remove(ORG, created.id, other)).rejects.toBeInstanceOf(ForbiddenError);
    const removed = await svc.remove(ORG, created.id, member);
    expect(removed.status).toBe('removed');
    expect(removed.removedBy).toBe(member.id);
    expect(flags[0]).toMatchObject({ resolvedAt: null, resolution: null, resolvedBy: null });
    expect(calls.at(-1)?.[0]).toMatchObject({
      type: 'discussion.post.removed',
      metadata: { actorOrgUserId: member.id, previousStatus: 'published' },
    });
  });

  it('resolves the flags as removed when a moderator removes the post', async () => {
    const { svc, flags } = harness();
    const created = await svc.create(ORG, member, draftInput());
    await svc.flag(ORG, created.id, other, 'spam');
    await svc.remove(ORG, created.id, moderator);
    expect(flags[0]).toMatchObject({ resolution: 'removed', resolvedBy: moderator.id });
  });

  it('refuses to remove a draft or a scheduled post', async () => {
    const { svc, calls } = harness();
    const draft = await svc.create(ORG, member, draftInput({ mode: 'draft' }));
    const scheduled = await svc.create(
      ORG,
      member,
      draftInput({ mode: 'schedule', scheduledAt: new Date('2026-10-30T09:00:00.000Z') }),
    );
    calls.length = 0;
    await expect(svc.remove(ORG, draft.id, member)).rejects.toBeInstanceOf(ConflictError);
    await expect(svc.remove(ORG, scheduled.id, member)).rejects.toBeInstanceOf(ConflictError);
    expect(calls).toHaveLength(0);
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
    const created = await svc.create(ORG, member, draftInput());
    const removed = await svc.remove(ORG, created.id, member);
    const restored = await svc.restore(ORG, removed.id, staff);
    expect(restored.status).toBe('published');
    expect(restored.removedBy).toBeNull();
    expect(restored.publishedAt).toBeInstanceOf(Date);
  });

  it('restores a member post to review when the space requires it', async () => {
    const { svc, calls, setSpaces } = harness({ roles: { ou_staff: 'owner' } });
    setSpaces([space({ settings: { comments: true, reactions: true, requireReview: true } })]);
    const created = await svc.create(ORG, member, draftInput());
    const removed = await svc.remove(ORG, created.id, member);
    const restored = await svc.restore(ORG, removed.id, moderator);
    expect(restored.status).toBe('pending');
    expect(restored.publishedAt).toBeNull();
    expect(calls.at(-1)?.[0]).toMatchObject({
      type: 'discussion.post.updated',
      metadata: { actorOrgUserId: moderator.id, previousStatus: 'removed' },
    });
    const staffPost = await svc.create(ORG, staff, draftInput({ title: 'Staff' }));
    const staffRemoved = await svc.remove(ORG, staffPost.id, staff);
    const staffRestored = await svc.restore(ORG, staffRemoved.id, moderator);
    expect(staffRestored.status).toBe('published');
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
    const page = await svc.spaceFeed(ORG, other, 'cmy_1', 'spc_1', feed);
    expect(page.rows.map((row) => row.title)).toEqual(['Newer', 'Older']);
    expect(page.rows.some((row) => row.id === draft.id)).toBe(false);
  });

  it('reads the member feed from the spaces the person can open', async () => {
    const { svc, setSpaces } = harness();
    setSpaces([space(), space({ id: 'spc_2', name: 'Other', seq: 1 })]);
    await svc.create(ORG, member, draftInput());
    await svc.create(ORG, member, draftInput({ spaceId: 'spc_2', title: 'Second' }));
    const page = await svc.memberFeed(ORG, member, 'cmy_1', feed);
    expect(page.rows).toHaveLength(2);
    expect(page.nextCursor).toBeNull();
    const hidden = await svc.memberFeed(ORG, outsider, 'cmy_1', feed);
    expect(hidden.rows).toHaveLength(0);
  });

  it('answers whether a post is due without loading the due posts', async () => {
    const { svc, repo } = harness({ roles: { ou_member: 'student' } });
    const listDue = vi.spyOn(repo, 'listDue');
    const when = new Date('2026-10-21T08:00:00.000Z');
    await svc.create(ORG, member, draftInput({ mode: 'schedule', scheduledAt: when }));
    await expect(svc.hasDue(ORG, new Date('2026-10-21T07:00:00.000Z'))).resolves.toBe(false);
    await expect(svc.hasDue(ORG, new Date('2026-10-21T09:00:00.000Z'))).resolves.toBe(true);
    expect(listDue).not.toHaveBeenCalled();
  });

  it('submits a due post as its author, with no actor, and applies review to a member', async () => {
    const { svc, calls, setSpaces } = harness({
      roles: { ou_staff: 'owner', ou_member: 'student' },
    });
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
    const reported = calls.length;
    const again = await svc.flag(ORG, created.id, other, 'again');
    expect(again).toMatchObject({ id: flagged.id, reason: 'spam' });
    expect(calls).toHaveLength(reported);
    expect(flags).toHaveLength(1);
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
    await expect(svc.moderationQueue(ORG, member, 'cmy_1', 'spc_1')).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    const queue = await svc.moderationQueue(ORG, moderator, 'cmy_1', 'spc_1');
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
    const queue = await svc.moderationQueue(ORG, moderator, 'cmy_1', 'spc_1');
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

  it('moves a due post back to draft when its author can no longer open the space', async () => {
    const { svc, calls, rows } = harness({ roles: { ou_member: 'student', ou_out: 'student' } });
    const when = new Date('2026-10-21T08:00:00.000Z');
    const scheduled = await svc.create(
      ORG,
      member,
      draftInput({ mode: 'schedule', scheduledAt: when }),
    );
    const row = rows.find((item) => item.id === scheduled.id);
    if (row) {
      row.orgUserId = outsider.id;
    }
    calls.length = 0;
    await svc.publishDue(ORG, new Date('2026-10-21T09:00:00.000Z'));
    expect(rows.find((item) => item.id === scheduled.id)).toMatchObject({
      status: 'draft',
      scheduledAt: null,
      publishedAt: null,
    });
    expect(calls[0]).toEqual([
      expect.objectContaining({
        type: 'discussion.post.updated',
        metadata: { previousStatus: 'scheduled' },
      }),
    ]);
  });

  it('moves a due post back to draft when its topic no longer fits the space', async () => {
    const { svc, calls, rows, setSpaces } = harness({ roles: { ou_member: 'student' } });
    const when = new Date('2026-10-21T08:00:00.000Z');
    const scheduled = await svc.create(
      ORG,
      member,
      draftInput({ mode: 'schedule', scheduledAt: when }),
    );
    setSpaces([space({ topics: [topic('top_1')] })]);
    calls.length = 0;
    await svc.publishDue(ORG, new Date('2026-10-21T09:00:00.000Z'));
    expect(rows.find((item) => item.id === scheduled.id)?.status).toBe('draft');
    expect(calls[0]?.map((event) => event.type)).toEqual(['discussion.post.updated']);
  });

  it('refuses to submit a draft whose topic the space no longer allows', async () => {
    const { svc, calls, setSpaces } = harness();
    const draft = await svc.create(ORG, member, draftInput({ mode: 'draft' }));
    setSpaces([space({ topics: [topic('top_1')] })]);
    calls.length = 0;
    await expect(svc.submit(ORG, draft.id, member)).rejects.toBeInstanceOf(ConflictError);
    expect(calls).toHaveLength(0);
  });

  it('keeps drafts and scheduled posts from moderators and staff, and shows them pending and removed', async () => {
    const { svc, setSpaces } = harness();
    const draft = await svc.create(ORG, member, draftInput({ mode: 'draft' }));
    const scheduled = await svc.create(
      ORG,
      member,
      draftInput({ mode: 'schedule', scheduledAt: new Date('2026-10-30T09:00:00.000Z') }),
    );
    for (const reader of [moderator, staff]) {
      await expect(svc.getPost(ORG, reader, draft.id)).rejects.toBeInstanceOf(NotFoundError);
      await expect(svc.getPost(ORG, reader, scheduled.id)).rejects.toBeInstanceOf(NotFoundError);
      await expect(svc.pin(ORG, draft.id, reader)).rejects.toBeInstanceOf(NotFoundError);
    }
    setSpaces([space({ settings: { comments: true, reactions: true, requireReview: true } })]);
    const pending = await svc.create(ORG, member, draftInput());
    await expect(svc.getPost(ORG, moderator, pending.id)).resolves.toMatchObject({
      status: 'pending',
    });
    await svc.remove(ORG, pending.id, moderator);
    await expect(svc.getPost(ORG, staff, pending.id)).resolves.toMatchObject({
      status: 'removed',
    });
  });

  it('refuses a space of another community on create, feed and queue', async () => {
    const { svc, calls } = harness();
    await expect(
      svc.create(ORG, member, draftInput({ communityId: 'cmy_other' })),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(calls).toHaveLength(0);
    await expect(svc.spaceFeed(ORG, member, 'cmy_other', 'spc_1', feed)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(svc.moderationQueue(ORG, moderator, 'cmy_other', 'spc_1')).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('lists your own posts in every status and the posts you bookmarked that you can still see', async () => {
    const { svc } = harness();
    const draft = await svc.create(ORG, member, draftInput({ mode: 'draft', title: 'Draft' }));
    const published = await svc.create(ORG, member, draftInput({ title: 'Published' }));
    await svc.create(ORG, other, draftInput({ title: 'Theirs' }));
    const own = await svc.listOwn(ORG, member, 'cmy_1');
    expect(own.map((post) => post.id).sort()).toEqual([draft.id, published.id].sort());
    expect(own[0]?.author.id).toBe(member.id);

    const theirs = await svc.create(ORG, other, draftInput({ title: 'Saved' }));
    await svc.bookmark(ORG, theirs.id, member);
    await svc.bookmark(ORG, published.id, other);
    expect((await svc.listBookmarked(ORG, member, 'cmy_1')).map((post) => post.id)).toEqual([
      theirs.id,
    ]);
    await svc.remove(ORG, theirs.id, moderator);
    expect(await svc.listBookmarked(ORG, member, 'cmy_1')).toEqual([]);
    expect(await svc.listOwn(ORG, outsider, 'cmy_1')).toEqual([]);
  });

  it('pages a feed with a cursor on pinned, publish time and id', async () => {
    const { svc, rows } = harness();
    const titles = ['One', 'Two', 'Three', 'Four', 'Five'];
    for (const [index, title] of titles.entries()) {
      const post = await svc.create(ORG, member, draftInput({ title }));
      const row = rows.find((item) => item.id === post.id);
      if (row) {
        row.publishedAt = new Date(Date.UTC(2026, 9, 1 + index));
        row.pinned = title === 'Two';
      }
    }
    const first = await svc.spaceFeed(ORG, other, 'cmy_1', 'spc_1', { limit: 2 });
    expect(first.rows.map((row) => row.title)).toEqual(['Two', 'Five']);
    expect(first.nextCursor).toEqual(expect.any(String));
    const second = await svc.memberFeed(ORG, other, 'cmy_1', {
      limit: 2,
      cursor: first.nextCursor ?? undefined,
    });
    expect(second.rows.map((row) => row.title)).toEqual(['Four', 'Three']);
    const last = await svc.spaceFeed(ORG, other, 'cmy_1', 'spc_1', {
      limit: 2,
      cursor: second.nextCursor ?? undefined,
    });
    expect(last.rows.map((row) => row.title)).toEqual(['One']);
    expect(last.nextCursor).toBeNull();
    await expect(
      svc.spaceFeed(ORG, other, 'cmy_1', 'spc_1', { limit: 2, cursor: 'not-a-cursor' }),
    ).rejects.toBeInstanceOf(InvalidCursorError);
  });

  it('serves each post with its author profile, and the photo only when it is in this org', async () => {
    const { svc } = harness({
      profiles: {
        ou_member: {
          displayName: 'Sarah Lee',
          headline: 'Founder at Acme',
          imageAssetOrgId: ORG,
          imageAssetId: 'ast_photo',
        },
        ou_other: { imageAssetOrgId: 'org-2', imageAssetId: 'ast_elsewhere', image: 'https://img' },
      },
    });
    const mine = await svc.create(ORG, member, draftInput({ title: 'Mine' }));
    await svc.create(ORG, other, draftInput({ title: 'Theirs' }));
    const read = await svc.getPost(ORG, other, mine.id);
    expect(read.author).toEqual({
      id: member.id,
      firstName: 'First',
      lastName: 'Last',
      displayName: 'Sarah Lee',
      headline: 'Founder at Acme',
      image: null,
      imageAssetId: 'ast_photo',
      imageUrl: 'signed:ast_photo',
      role: 'student',
    });
    const feedPage = await svc.spaceFeed(ORG, member, 'cmy_1', 'spc_1', feed);
    const theirs = feedPage.rows.find((row) => row.title === 'Theirs');
    expect(theirs?.author).toMatchObject({
      displayName: 'First Last',
      image: 'https://img',
      imageAssetId: null,
      imageUrl: null,
    });
  });

  it('serves the cover and author photo URLs from every call that returns a post', async () => {
    const { svc, setSpaces } = harness({
      roles: { ou_mod: 'moderator' },
      profiles: { ou_member: { imageAssetOrgId: ORG, imageAssetId: 'ast_photo' } },
    });
    const signed = { coverUrl: 'signed:ast_cover', author: { imageUrl: 'signed:ast_photo' } };
    const created = await svc.create(ORG, member, draftInput({ coverAssetId: 'ast_cover' }));
    expect(created).toMatchObject(signed);
    const id = created.id;
    expect(await svc.update(ORG, id, member, { title: 'Hello' })).toMatchObject(signed);
    expect(await svc.update(ORG, id, member, { title: 'Revised' })).toMatchObject(signed);
    expect(await svc.getPost(ORG, other, id)).toMatchObject(signed);
    expect(await svc.pin(ORG, id, moderator)).toMatchObject(signed);
    expect(await svc.pin(ORG, id, moderator)).toMatchObject(signed);
    expect(await svc.unpin(ORG, id, moderator)).toMatchObject(signed);
    expect(await svc.closeComments(ORG, id, moderator)).toMatchObject(signed);
    expect(await svc.openComments(ORG, id, moderator)).toMatchObject(signed);
    expect(await svc.setReactions(ORG, id, moderator, false)).toMatchObject(signed);
    expect((await svc.spaceFeed(ORG, other, 'cmy_1', 'spc_1', feed)).rows[0]).toMatchObject(signed);
    expect((await svc.memberFeed(ORG, other, 'cmy_1', feed)).rows[0]).toMatchObject(signed);
    expect((await svc.listOwn(ORG, member, 'cmy_1'))[0]).toMatchObject(signed);
    await svc.bookmark(ORG, id, other);
    expect((await svc.listBookmarked(ORG, other, 'cmy_1'))[0]).toMatchObject(signed);
    expect(await svc.remove(ORG, id, member)).toMatchObject(signed);
    expect(await svc.restore(ORG, id, moderator)).toMatchObject(signed);

    const draft = await svc.create(
      ORG,
      member,
      draftInput({ mode: 'draft', coverAssetId: 'ast_cover' }),
    );
    expect(draft).toMatchObject(signed);
    expect(
      await svc.schedule(ORG, draft.id, member, new Date('2026-10-30T09:00:00.000Z')),
    ).toMatchObject(signed);
    setSpaces([space({ settings: { comments: true, reactions: true, requireReview: true } })]);
    const submitted = await svc.submit(ORG, draft.id, member);
    expect(submitted).toMatchObject({ status: 'pending', ...signed });
    const queue = await svc.moderationQueue(ORG, moderator, 'cmy_1', 'spc_1');
    expect(queue.pending[0]).toMatchObject(signed);
    expect(await svc.approve(ORG, draft.id, moderator)).toMatchObject(signed);
  });

  it('serves no cover URL for a post without a cover or a cover the signer leaves out', async () => {
    const { svc } = harness({ unsigned: ['ast_gone'] });
    const bare = await svc.create(ORG, member, draftInput());
    expect(bare).toMatchObject({ coverAssetId: null, coverUrl: null, author: { imageUrl: null } });
    const gone = await svc.create(ORG, member, draftInput({ coverAssetId: 'ast_gone' }));
    expect(gone).toMatchObject({ coverAssetId: 'ast_gone', coverUrl: null });
  });
});
