import { genId } from '../shared/id.js';
import {
  ConflictError,
  ForbiddenError,
  InvalidInputError,
  NotFoundError,
} from '../shared/errors.js';
import type { Logger } from '../shared/ports.js';
import { noopLogger } from '../shared/logger.js';
import { canModerate, isStaffRole } from '../organizations/index.js';
import type { Role } from '../organizations/index.js';
import type { CommunityReader, SpaceDetail } from '../content/index.js';
import type { CommunityAccessReader } from '../entitlements/index.js';
import type { AssetFiles, FileUrls, MemberImageReader } from '../assets/index.js';
import type { Post, PostFlag, PostFlagResolution, PostStatus, PostView } from '../types/index.js';
import type { Actor } from '../shared/actor.js';
import type { NewDiscussionEvent } from './events.js';
import { discussionEvents } from './events.js';
import { authorView } from './authors.js';
import type {
  AuthorProfileReader,
  AuthorRoleReader,
  CreatePostInput,
  FeedQuery,
  PageQuery,
  PostPatch,
  PostCommentReader,
  PostReactions,
  PostRepository,
  PostService,
  PostUnitOfWork,
  SpaceModerationQueue,
  UpdatePostInput,
} from './ports.js';
import type { Page, ReactionEmoji } from './types.js';

export type PostServiceParams = {
  repo: PostRepository;
  access: CommunityAccessReader;
  content: CommunityReader;
  authors: AuthorRoleReader;
  profiles: AuthorProfileReader;
  comments: PostCommentReader;
  images: MemberImageReader & Pick<AssetFiles, 'signFile'>;
  fileUrls: FileUrls;
  uow: PostUnitOfWork;
  logger?: Logger;
};

const PUBLISHED_ONLY: PostStatus[] = ['published'];
const MODERATOR_VISIBLE: PostStatus[] = ['published', 'pending', 'removed'];

export class PostServiceImpl implements PostService {
  private readonly repo: PostRepository;
  private readonly access: CommunityAccessReader;
  private readonly content: CommunityReader;
  private readonly authors: AuthorRoleReader;
  private readonly profiles: AuthorProfileReader;
  private readonly comments: PostCommentReader;
  private readonly images: MemberImageReader & Pick<AssetFiles, 'signFile'>;
  private readonly fileUrls: FileUrls;
  private readonly uow: PostUnitOfWork;
  private readonly logger: Logger;

  constructor(params: PostServiceParams) {
    this.repo = params.repo;
    this.access = params.access;
    this.content = params.content;
    this.authors = params.authors;
    this.profiles = params.profiles;
    this.comments = params.comments;
    this.images = params.images;
    this.fileUrls = params.fileUrls;
    this.uow = params.uow;
    this.logger = params.logger ?? noopLogger;
  }

  async visibleTitles(
    orgId: string,
    actor: Actor,
    postIds: string[],
  ): Promise<Record<string, string>> {
    const found = await this.repo.findMany(orgId, [...new Set(postIds)]);
    const communityIds = [...new Set(found.map((post) => post.communityId))];
    const open = new Set(
      (
        await Promise.all(
          communityIds.map((communityId) => this.access.openSpaceIds(orgId, actor, communityId)),
        )
      ).flat(),
    );
    return Object.fromEntries(
      found
        .filter((post) => open.has(post.spaceId) && this.canSee(actor, post))
        .map((post) => [post.id, post.title]),
    );
  }

  async create(orgId: string, actor: Actor, input: CreatePostInput): Promise<PostView> {
    const space = await this.requireOpen(orgId, actor, input.spaceId, input.communityId);
    await this.requireOwnedImage(orgId, actor.id, input.coverAssetId);
    this.assertTopic(space, input.topicId);
    const now = new Date();
    const landing = this.initial(input, space, actor, now);
    const post: Post = {
      orgId,
      id: genId('post'),
      communityId: space.communityId,
      spaceId: space.id,
      orgUserId: actor.id,
      topicId: input.topicId,
      title: input.title,
      body: input.body,
      extra: input.extra,
      coverAssetId: input.coverAssetId,
      pinned: false,
      commentsClosed: null,
      reactionsEnabled: null,
      createdAt: now,
      updatedAt: now,
      ...landing,
    };
    const saved = await this.uow.run(async ({ posts, outbox }) => {
      const created = await posts.insert(orgId, post);
      const events: NewDiscussionEvent[] = [
        discussionEvents.postCreated.make({
          orgId,
          data: created,
          metadata: this.meta(actor, created.status === 'pending' ? null : undefined),
        }),
      ];
      if (created.status === 'published') {
        events.push(
          discussionEvents.postPublished.make({
            orgId,
            data: created,
            metadata: this.meta(actor, null),
          }),
        );
      }
      await outbox.append(events);
      return created;
    });
    this.logger.info('post created', {
      orgId,
      postId: saved.id,
      status: saved.status,
      actorId: actor.id,
    });
    return this.viewOf(orgId, actor, saved);
  }

  async update(
    orgId: string,
    postId: string,
    actor: Actor,
    patch: UpdatePostInput,
  ): Promise<PostView> {
    const { post, space } = await this.loadVisible(orgId, actor, postId);
    this.assertAuthor(actor, post);
    if (post.status === 'removed') {
      throw new ConflictError('This post was removed');
    }
    if (patch.topicId !== undefined) {
      this.assertTopic(space, patch.topicId);
    }
    if (typeof patch.coverAssetId === 'string') {
      await this.requireOwnedImage(orgId, actor.id, patch.coverAssetId);
    }
    if (!this.patchChanges(post, patch)) {
      return this.viewOf(orgId, actor, post);
    }
    const updated = await this.uow.run(async ({ posts, outbox }) => {
      const next = await this.mustUpdate(posts, orgId, postId, patch);
      await outbox.append([
        discussionEvents.postUpdated.make({
          orgId,
          data: next,
          metadata: this.meta(actor, next.status === 'pending' ? post.status : undefined),
        }),
      ]);
      return next;
    });
    this.logger.info('post updated', {
      orgId,
      postId,
      fields: Object.keys(patch),
      actorId: actor.id,
    });
    return this.viewOf(orgId, actor, updated);
  }

  async submit(orgId: string, postId: string, actor: Actor): Promise<PostView> {
    const { post, space } = await this.loadVisible(orgId, actor, postId);
    this.assertAuthor(actor, post);
    if (post.status !== 'draft' && post.status !== 'scheduled') {
      throw new ConflictError('This post cannot be submitted');
    }
    this.assertTopic(space, post.topicId);
    const saved = await this.commitSubmission(orgId, post, space, actor.role, actor, new Date());
    this.logger.info('post submitted', { orgId, postId, status: saved.status, actorId: actor.id });
    return this.viewOf(orgId, actor, saved);
  }

  async schedule(
    orgId: string,
    postId: string,
    actor: Actor,
    scheduledAt: Date,
  ): Promise<PostView> {
    const { post } = await this.loadVisible(orgId, actor, postId);
    this.assertAuthor(actor, post);
    if (post.status === 'published' || post.status === 'removed' || post.status === 'pending') {
      throw new ConflictError('This post cannot be scheduled');
    }
    if (scheduledAt <= new Date()) {
      throw new InvalidInputError('A scheduled time must be in the future');
    }
    const updated = await this.uow.run(async ({ posts, outbox }) => {
      const next = await this.mustUpdate(posts, orgId, postId, {
        status: 'scheduled',
        scheduledAt,
        publishedAt: null,
        removedBy: null,
      });
      await outbox.append([
        discussionEvents.postUpdated.make({
          orgId,
          data: next,
          metadata: this.meta(actor, post.status),
        }),
      ]);
      return next;
    });
    this.logger.info('post scheduled', {
      orgId,
      postId,
      scheduledAt: scheduledAt.toISOString(),
      actorId: actor.id,
    });
    return this.viewOf(orgId, actor, updated);
  }

  async approve(
    orgId: string,
    postId: string,
    actor: Actor,
    communityId?: string,
  ): Promise<PostView> {
    const { post } = await this.loadVisible(orgId, actor, postId, communityId);
    if (!this.canModerate(actor)) {
      throw new ForbiddenError('You cannot review this post');
    }
    if (post.status !== 'pending') {
      throw new ConflictError('This post is not awaiting review');
    }
    const now = new Date();
    const updated = await this.uow.run(async ({ posts, outbox }) => {
      const next = await this.mustUpdate(posts, orgId, postId, {
        status: 'published',
        publishedAt: now,
        scheduledAt: null,
        removedBy: null,
      });
      await outbox.append([
        discussionEvents.postPublished.make({
          orgId,
          data: next,
          metadata: this.meta(actor, post.status),
        }),
      ]);
      return next;
    });
    this.logger.info('post approved', { orgId, postId, actorId: actor.id });
    return this.viewOf(orgId, actor, updated);
  }

  async remove(
    orgId: string,
    postId: string,
    actor: Actor,
    communityId?: string,
  ): Promise<PostView> {
    const { post } = await this.loadVisible(orgId, actor, postId, communityId);
    if (post.orgUserId !== actor.id && !this.canModerate(actor)) {
      throw new ForbiddenError('You cannot remove this post');
    }
    if (post.status === 'removed') {
      throw new ConflictError('This post was removed');
    }
    if (post.status !== 'published' && post.status !== 'pending') {
      throw new ConflictError('This post cannot be removed');
    }
    const updated = await this.uow.run(async ({ posts, outbox }) => {
      const next = await this.mustUpdate(posts, orgId, postId, {
        status: 'removed',
        removedBy: actor.id,
      });
      if (post.orgUserId !== actor.id) {
        await posts.resolveFlags(orgId, postId, {
          resolvedAt: new Date(),
          resolvedBy: actor.id,
          resolution: 'removed',
        });
      }
      await outbox.append([
        discussionEvents.postRemoved.make({
          orgId,
          data: next,
          metadata: this.meta(actor, post.status),
        }),
      ]);
      return next;
    });
    this.logger.info('post removed', { orgId, postId, actorId: actor.id });
    return this.viewOf(orgId, actor, updated);
  }

  async restore(
    orgId: string,
    postId: string,
    actor: Actor,
    communityId?: string,
  ): Promise<PostView> {
    const { post, space } = await this.loadVisible(orgId, actor, postId, communityId);
    if (!this.canModerate(actor)) {
      throw new ForbiddenError('You cannot moderate this post');
    }
    if (post.status !== 'removed') {
      throw new ConflictError('This post was not removed');
    }
    const now = new Date();
    const role = await this.authors.roleOf(orgId, post.orgUserId);
    const updated = await this.uow.run(async ({ posts, outbox }) => {
      const next = await this.mustUpdate(
        posts,
        orgId,
        postId,
        this.submissionOf(space.settings.requireReview, role, now),
      );
      const metadata = this.meta(actor, post.status);
      const event =
        next.status === 'published'
          ? discussionEvents.postPublished.make({ orgId, data: next, metadata })
          : discussionEvents.postUpdated.make({ orgId, data: next, metadata });
      await outbox.append([event]);
      return next;
    });
    this.logger.info('post restored', {
      orgId,
      postId,
      status: updated.status,
      actorId: actor.id,
    });
    return this.viewOf(orgId, actor, updated);
  }

  pin(orgId: string, postId: string, actor: Actor): Promise<PostView> {
    return this.moderate(
      orgId,
      postId,
      actor,
      { pinned: true },
      (post) => post.pinned,
      'post pinned',
    );
  }

  unpin(orgId: string, postId: string, actor: Actor): Promise<PostView> {
    return this.moderate(
      orgId,
      postId,
      actor,
      { pinned: false },
      (post) => !post.pinned,
      'post unpinned',
    );
  }

  closeComments(orgId: string, postId: string, actor: Actor): Promise<PostView> {
    return this.moderate(
      orgId,
      postId,
      actor,
      { commentsClosed: true },
      (post) => post.commentsClosed === true,
      'post comments closed',
    );
  }

  openComments(orgId: string, postId: string, actor: Actor): Promise<PostView> {
    return this.moderate(
      orgId,
      postId,
      actor,
      { commentsClosed: false },
      (post) => post.commentsClosed === false,
      'post comments opened',
    );
  }

  setReactions(orgId: string, postId: string, actor: Actor, enabled: boolean): Promise<PostView> {
    return this.moderate(
      orgId,
      postId,
      actor,
      { reactionsEnabled: enabled },
      (post) => post.reactionsEnabled === enabled,
      'post reactions changed',
    );
  }

  async setReaction(
    orgId: string,
    postId: string,
    actor: Actor,
    emoji: ReactionEmoji | null,
  ): Promise<PostReactions> {
    const { post, space } = await this.loadVisible(orgId, actor, postId);
    if (!(post.reactionsEnabled ?? space.settings.reactions)) {
      throw new ForbiddenError('Reactions are off on this post');
    }
    await this.repo.setReaction(orgId, postId, actor.id, emoji);
    this.logger.debug('post reaction set', { orgId, postId, orgUserId: actor.id });
    const counts = await this.repo.reactionsOf(orgId, [postId], actor.id);
    return counts[postId] ?? { reactions: {} };
  }

  async follow(orgId: string, postId: string, actor: Actor): Promise<void> {
    await this.loadVisible(orgId, actor, postId);
    await this.repo.follow(orgId, postId, actor.id);
    this.logger.debug('post followed', { orgId, postId, orgUserId: actor.id });
  }

  async unfollow(orgId: string, postId: string, actor: Actor): Promise<void> {
    await this.loadVisible(orgId, actor, postId);
    await this.repo.unfollow(orgId, postId, actor.id);
    this.logger.debug('post unfollowed', { orgId, postId, orgUserId: actor.id });
  }

  async bookmark(orgId: string, postId: string, actor: Actor): Promise<void> {
    await this.loadVisible(orgId, actor, postId);
    await this.repo.bookmark(orgId, postId, actor.id);
    this.logger.debug('post bookmarked', { orgId, postId, orgUserId: actor.id });
  }

  async unbookmark(orgId: string, postId: string, actor: Actor): Promise<void> {
    await this.loadVisible(orgId, actor, postId);
    await this.repo.unbookmark(orgId, postId, actor.id);
    this.logger.debug('post unbookmarked', { orgId, postId, orgUserId: actor.id });
  }

  async flag(orgId: string, postId: string, actor: Actor, reason: string): Promise<PostFlag> {
    const { post } = await this.loadVisible(orgId, actor, postId);
    const now = new Date();
    const flag: PostFlag = {
      orgId,
      id: genId('postFlag'),
      postId,
      orgUserId: actor.id,
      reason,
      resolvedAt: null,
      resolution: null,
      resolvedBy: null,
      createdAt: now,
      updatedAt: now,
    };
    const saved = await this.uow.run(async ({ posts, outbox }) => {
      const created = await posts.insertFlag(orgId, flag);
      if (!created) {
        const existing = await posts.findFlag(orgId, postId, actor.id);
        if (!existing) {
          throw new NotFoundError('Flag', postId);
        }
        return existing;
      }
      await outbox.append([
        discussionEvents.postReported.make({
          orgId,
          data: { ...created, communityId: post.communityId },
          metadata: this.meta(actor),
        }),
      ]);
      return created;
    });
    this.logger.info('post flagged', { orgId, postId, flagId: saved.id, actorId: actor.id });
    return saved;
  }

  async resolveFlags(
    orgId: string,
    postId: string,
    actor: Actor,
    resolution: Extract<PostFlagResolution, 'dismissed'>,
    communityId?: string,
  ): Promise<void> {
    await this.loadVisible(orgId, actor, postId, communityId);
    if (!this.canModerate(actor)) {
      throw new ForbiddenError('You cannot work this queue');
    }
    await this.repo.resolveFlags(orgId, postId, {
      resolvedAt: new Date(),
      resolvedBy: actor.id,
      resolution,
    });
    this.logger.info('post flags resolved', { orgId, postId, resolution, actorId: actor.id });
  }

  async spaceFeed(
    orgId: string,
    actor: Actor,
    communityId: string,
    spaceId: string,
    query: FeedQuery,
  ): Promise<Page<PostView>> {
    const space = await this.requireOpen(orgId, actor, spaceId, communityId);
    if (query.topicId && !space.topics.some((topic) => topic.id === query.topicId)) {
      throw new NotFoundError('Topic', query.topicId);
    }
    const page = await this.feedPage(orgId, actor, [spaceId], query);
    this.logger.debug('space feed read', { orgId, spaceId, rows: page.rows.length });
    return page;
  }

  async memberFeed(
    orgId: string,
    actor: Actor,
    communityId: string,
    query: Pick<FeedQuery, 'page' | 'pageSize'>,
  ): Promise<Page<PostView>> {
    const spaceIds = await this.openSpaceIdsIn(orgId, actor, communityId);
    const page = await this.feedPage(orgId, actor, spaceIds, query);
    this.logger.debug('member feed read', {
      orgId,
      communityId,
      spaces: spaceIds.length,
      rows: page.rows.length,
    });
    return page;
  }

  private async openSpaceIdsIn(
    orgId: string,
    actor: Actor,
    communityId: string,
  ): Promise<string[]> {
    if (!(await this.access.isCommunityMember(orgId, actor, communityId))) {
      throw new NotFoundError('Community', communityId);
    }
    return this.access.openSpaceIds(orgId, actor, communityId);
  }

  async listOwn(
    orgId: string,
    actor: Actor,
    communityId: string,
    query: PageQuery,
  ): Promise<Page<PostView>> {
    const spaceIds = await this.openSpaceIdsIn(orgId, actor, communityId);
    const page = await this.repo.listByAuthor(orgId, actor.id, spaceIds, query);
    this.logger.debug('own posts read', { orgId, communityId, rows: page.rows.length });
    return { ...page, rows: await this.viewsOf(orgId, actor, page.rows) };
  }

  async listBookmarked(
    orgId: string,
    actor: Actor,
    communityId: string,
    query: PageQuery,
  ): Promise<Page<PostView>> {
    const spaceIds = await this.openSpaceIdsIn(orgId, actor, communityId);
    const page = await this.repo.listBookmarked(orgId, actor.id, spaceIds, {
      ...query,
      visibleStatuses: this.visibleStatuses(actor),
    });
    this.logger.debug('bookmarked posts read', { orgId, communityId, rows: page.rows.length });
    return { ...page, rows: await this.viewsOf(orgId, actor, page.rows) };
  }

  async coverFile(orgId: string, actor: Actor, postId: string): Promise<string | null> {
    const post = await this.repo.find(orgId, postId);
    if (!post?.coverAssetId || !this.canSee(actor, post)) {
      return null;
    }
    const space = await this.content.getSpace(orgId, post.spaceId);
    if (!space || !(await this.access.canOpen(orgId, actor, space))) {
      return null;
    }
    return this.images.signFile(orgId, post.coverAssetId);
  }

  async getPost(orgId: string, actor: Actor, postId: string): Promise<PostView> {
    const { post } = await this.loadVisible(orgId, actor, postId);
    this.logger.debug('post read', { orgId, postId });
    return this.viewOf(orgId, actor, post);
  }

  async moderationQueue(
    orgId: string,
    actor: Actor,
    communityId: string,
    spaceId: string,
  ): Promise<SpaceModerationQueue> {
    await this.requireOpen(orgId, actor, spaceId, communityId);
    if (!this.canModerate(actor)) {
      throw new ForbiddenError('You cannot work this queue');
    }
    const [pending, flags, openCommentFlags] = await Promise.all([
      this.repo.listPending(orgId, spaceId),
      this.repo.listOpenFlags(orgId, spaceId),
      this.comments.listOpenFlagsForSpace(orgId, spaceId),
    ]);
    this.logger.debug('space queue read', {
      orgId,
      spaceId,
      pending: pending.length,
      flags: flags.length,
      commentFlags: openCommentFlags.length,
    });
    return {
      pending: await this.viewsOf(orgId, actor, pending),
      flags,
      commentFlags: openCommentFlags,
    };
  }

  visible(
    orgId: string,
    actor: Actor,
    postId: string,
  ): Promise<{ post: Post; space: SpaceDetail }> {
    return this.loadVisible(orgId, actor, postId);
  }

  find(orgId: string, postId: string): Promise<Post | null> {
    return this.repo.find(orgId, postId);
  }

  followerIds(orgId: string, postId: string): Promise<string[]> {
    return this.repo.followerIds(orgId, postId);
  }

  hasDue(orgId: string, now: Date): Promise<boolean> {
    return this.repo.hasDue(orgId, now);
  }

  async publishDue(orgId: string, now: Date): Promise<void> {
    const due = await this.repo.listDue(orgId, now);
    if (due.length === 0) {
      this.logger.debug('no posts due', { orgId });
      return;
    }
    const spaces = new Map<string, SpaceDetail | null>();
    const roles = new Map<string, Role | null>();
    const refused = new Set<string>();
    for (const post of due) {
      if (!spaces.has(post.spaceId)) {
        spaces.set(post.spaceId, await this.content.getSpace(orgId, post.spaceId));
      }
      if (!roles.has(post.orgUserId)) {
        roles.set(post.orgUserId, await this.authors.roleOf(orgId, post.orgUserId));
      }
      const space = spaces.get(post.spaceId);
      const role = roles.get(post.orgUserId) ?? null;
      if (space && !(await this.submittable(orgId, post, space, role))) {
        refused.add(post.id);
      }
    }
    const count = await this.uow.run(async ({ posts, outbox }) => {
      const events: NewDiscussionEvent[] = [];
      for (const post of due) {
        const current = await posts.find(orgId, post.id);
        if (
          !current ||
          current.status !== 'scheduled' ||
          current.scheduledAt === null ||
          current.scheduledAt > now
        ) {
          continue;
        }
        const space = spaces.get(current.spaceId);
        if (!space) {
          this.logger.error('scheduled post has no space', {
            orgId,
            postId: current.id,
            spaceId: current.spaceId,
          });
          continue;
        }
        const next = await posts.update(
          orgId,
          current.id,
          refused.has(current.id)
            ? { status: 'draft', scheduledAt: null, publishedAt: null, removedBy: null }
            : this.submissionOf(
                space.settings.requireReview,
                roles.get(current.orgUserId) ?? null,
                now,
              ),
        );
        if (!next) {
          continue;
        }
        const metadata = this.meta(null, current.status);
        events.push(
          next.status === 'published'
            ? discussionEvents.postPublished.make({ orgId, data: next, metadata })
            : discussionEvents.postUpdated.make({ orgId, data: next, metadata }),
        );
      }
      if (events.length > 0) {
        await outbox.append(events);
      }
      return events.length;
    });
    if (count > 0) {
      this.logger.info('due posts submitted', { orgId, count, refused: refused.size });
    }
  }

  private async submittable(
    orgId: string,
    post: Post,
    space: SpaceDetail,
    role: Role | null,
  ): Promise<boolean> {
    if (role === null || !this.topicFits(space, post.topicId)) {
      return false;
    }
    return this.access.canOpen(orgId, { id: post.orgUserId, role }, space);
  }

  private async feedPage(
    orgId: string,
    actor: Actor,
    spaceIds: string[],
    query: FeedQuery,
  ): Promise<Page<PostView>> {
    const page = await this.repo.listPublished(orgId, spaceIds, query);
    return { ...page, rows: await this.viewsOf(orgId, actor, page.rows) };
  }

  private async viewOf(orgId: string, actor: Actor, post: Post): Promise<PostView> {
    const [view] = await this.viewsOf(orgId, actor, [post]);
    return view!;
  }

  private async viewsOf(orgId: string, actor: Actor, posts: Post[]): Promise<PostView[]> {
    if (posts.length === 0) {
      return [];
    }
    const postIds = posts.map((post) => post.id);
    const [records, reactions, commentCounts, followed, bookmarked] = await Promise.all([
      this.profiles.authorsOf(orgId, [...new Set(posts.map((post) => post.orgUserId))]),
      this.repo.reactionsOf(orgId, postIds, actor.id),
      this.comments.publishedCommentCounts(orgId, postIds),
      this.repo.followedAmong(orgId, postIds, actor.id),
      this.repo.bookmarkedAmong(orgId, postIds, actor.id),
    ]);
    const following = new Set(followed);
    const saved = new Set(bookmarked);
    return posts.map((post) => {
      const record = records[post.orgUserId];
      if (!record) {
        throw new NotFoundError('Member', post.orgUserId);
      }
      const counts = reactions[post.id];
      return {
        ...post,
        coverUrl: post.coverAssetId ? this.fileUrls.postCover(post.id) : null,
        author: authorView(orgId, record, this.fileUrls),
        reactions: counts?.reactions ?? {},
        viewerReaction: counts?.viewerReaction ?? null,
        commentCount: commentCounts[post.id] ?? 0,
        following: following.has(post.id),
        bookmarked: saved.has(post.id),
      };
    });
  }

  private async commitSubmission(
    orgId: string,
    post: Post,
    space: SpaceDetail,
    role: Role,
    actor: Actor,
    now: Date,
  ): Promise<Post> {
    return this.uow.run(async ({ posts, outbox }) => {
      const next = await this.mustUpdate(
        posts,
        orgId,
        post.id,
        this.submissionOf(space.settings.requireReview, role, now),
      );
      const metadata = this.meta(actor, post.status);
      const event =
        next.status === 'published'
          ? discussionEvents.postPublished.make({ orgId, data: next, metadata })
          : discussionEvents.postUpdated.make({ orgId, data: next, metadata });
      await outbox.append([event]);
      return next;
    });
  }

  private async moderate(
    orgId: string,
    postId: string,
    actor: Actor,
    patch: PostPatch,
    unchanged: (post: Post) => boolean,
    log: string,
  ): Promise<PostView> {
    const { post } = await this.loadVisible(orgId, actor, postId);
    if (!this.canModerate(actor)) {
      throw new ForbiddenError('You cannot moderate this post');
    }
    if (post.status === 'removed') {
      throw new ConflictError('This post was removed');
    }
    if (unchanged(post)) {
      return this.viewOf(orgId, actor, post);
    }
    const updated = await this.uow.run(async ({ posts, outbox }) => {
      const next = await this.mustUpdate(posts, orgId, postId, patch);
      await outbox.append([
        discussionEvents.postUpdated.make({
          orgId,
          data: next,
          metadata: this.meta(actor, next.status === 'pending' ? post.status : undefined),
        }),
      ]);
      return next;
    });
    this.logger.info(log, { orgId, postId, actorId: actor.id });
    return this.viewOf(orgId, actor, updated);
  }

  private async mustUpdate(
    posts: PostRepository,
    orgId: string,
    postId: string,
    patch: PostPatch,
  ): Promise<Post> {
    const next = await posts.update(orgId, postId, patch);
    if (!next) {
      throw new NotFoundError('Post', postId);
    }
    return next;
  }

  private initial(input: CreatePostInput, space: SpaceDetail, actor: Actor, now: Date) {
    if (input.mode === 'draft') {
      return { status: 'draft' as const, scheduledAt: null, publishedAt: null, removedBy: null };
    }
    if (input.mode === 'schedule') {
      if (!input.scheduledAt) {
        throw new InvalidInputError('A scheduled post needs a time');
      }
      if (input.scheduledAt <= now) {
        throw new InvalidInputError('A scheduled time must be in the future');
      }
      return {
        status: 'scheduled' as const,
        scheduledAt: input.scheduledAt,
        publishedAt: null,
        removedBy: null,
      };
    }
    return this.submissionOf(space.settings.requireReview, actor.role, now);
  }

  private submissionOf(requireReview: boolean, role: Role | null, now: Date) {
    if (requireReview && !(role && isStaffRole(role))) {
      return { status: 'pending' as const, scheduledAt: null, publishedAt: null, removedBy: null };
    }
    return { status: 'published' as const, scheduledAt: null, publishedAt: now, removedBy: null };
  }

  private async requireOwnedImage(
    orgId: string,
    orgUserId: string,
    assetId: string | null,
  ): Promise<void> {
    if (assetId === null) {
      return;
    }
    if (!(await this.images.ownsImage(orgId, assetId, orgUserId))) {
      this.logger.debug('cover refused', { orgId, orgUserId, assetId });
      throw new NotFoundError('Asset', assetId);
    }
  }

  private async requireOpen(
    orgId: string,
    actor: Actor,
    spaceId: string,
    communityId?: string,
  ): Promise<SpaceDetail> {
    const space = await this.content.getSpace(orgId, spaceId);
    if (!space || (communityId !== undefined && space.communityId !== communityId)) {
      throw new NotFoundError('Space', spaceId);
    }
    if (!(await this.access.canOpen(orgId, actor, space))) {
      throw new ForbiddenError('You cannot open this space');
    }
    return space;
  }

  private async loadVisible(orgId: string, actor: Actor, postId: string, communityId?: string) {
    const post = await this.repo.find(orgId, postId);
    if (!post || (communityId !== undefined && post.communityId !== communityId)) {
      throw new NotFoundError('Post', postId);
    }
    const space = await this.requireOpen(orgId, actor, post.spaceId);
    if (!this.canSee(actor, post)) {
      throw new NotFoundError('Post', postId);
    }
    return { post, space };
  }

  private canSee(actor: Actor, post: Post): boolean {
    return post.orgUserId === actor.id || this.visibleStatuses(actor).includes(post.status);
  }

  private visibleStatuses(actor: Actor): PostStatus[] {
    return this.canModerate(actor) ? MODERATOR_VISIBLE : PUBLISHED_ONLY;
  }

  private canModerate(actor: Actor): boolean {
    return canModerate(actor.role);
  }

  private assertAuthor(actor: Actor, post: Post): void {
    if (post.orgUserId !== actor.id) {
      throw new ForbiddenError('You can change only your own post');
    }
  }

  private topicFits(space: SpaceDetail, topicId: string | null): boolean {
    if (topicId === null) {
      return space.topics.length === 0;
    }
    return space.topics.some((topic) => topic.id === topicId);
  }

  private assertTopic(space: SpaceDetail, topicId: string | null): void {
    if (this.topicFits(space, topicId)) {
      return;
    }
    if (topicId === null) {
      throw new InvalidInputError('This space requires a topic');
    }
    throw new NotFoundError('Topic', topicId);
  }

  private patchChanges(post: Post, patch: UpdatePostInput): boolean {
    return (Object.keys(patch) as (keyof UpdatePostInput)[]).some((key) => {
      const value = patch[key];
      if (value === undefined) {
        return false;
      }
      if (key === 'extra') {
        return JSON.stringify(post.extra) !== JSON.stringify(value);
      }
      return post[key] !== value;
    });
  }

  private meta(actor: Actor | null, previousStatus?: PostStatus | null) {
    return {
      ...(actor ? { actorOrgUserId: actor.id } : {}),
      ...(previousStatus !== undefined ? { previousStatus } : {}),
    };
  }
}
