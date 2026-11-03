import { genId } from '../shared/id.js';
import {
  ConflictError,
  ForbiddenError,
  InvalidInputError,
  NotFoundError,
  UnavailableError,
} from '../shared/errors.js';
import type { Logger, Scheduler } from '../shared/ports.js';
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
import { POST_PUBLISH_JOB } from './jobs.js';
import { activeSubscription } from './subscriptions.js';
import { keepAllowed, mentionTokens, mentionViews } from './mentions.js';
import type {
  AuthorProfileReader,
  AuthorRoleReader,
  CreatePostInput,
  FeedQuery,
  MentionsRepository,
  PageQuery,
  PostPatch,
  PostCommentReader,
  PostReactions,
  PostRepository,
  PostService,
  PostUnitOfWork,
  SpaceModerationQueue,
  SubscriptionsRepository,
  UpdatePostInput,
  PublishedPost,
} from './ports.js';
import { MODERATION_QUEUE_LIMIT } from './ports.js';
import type { Page, ReactionEmoji } from './types.js';

export type PostServiceParams = {
  repo: PostRepository;
  access: CommunityAccessReader;
  content: CommunityReader;
  authors: AuthorRoleReader;
  profiles: AuthorProfileReader;
  comments: PostCommentReader;
  subscriptions: SubscriptionsRepository;
  mentions: MentionsRepository;
  images: MemberImageReader & Pick<AssetFiles, 'signFile'>;
  fileUrls: FileUrls;
  uow: PostUnitOfWork;
  scheduler: Pick<Scheduler, 'at' | 'cancel'>;
  logger?: Logger;
};

type EventMeta = { actorOrgUserId?: string; previousStatus?: PostStatus | null };

const PUBLISHED_ONLY: PostStatus[] = ['published'];
const MODERATOR_VISIBLE: PostStatus[] = ['published', 'pending', 'removed'];
const DRAFT = {
  status: 'draft' as const,
  scheduledAt: null,
  publishedAt: null,
  removedBy: null,
};

export class PostServiceImpl implements PostService {
  private readonly repo: PostRepository;
  private readonly access: CommunityAccessReader;
  private readonly content: CommunityReader;
  private readonly authors: AuthorRoleReader;
  private readonly profiles: AuthorProfileReader;
  private readonly comments: PostCommentReader;
  private readonly subscriptions: SubscriptionsRepository;
  private readonly mentions: MentionsRepository;
  private readonly images: MemberImageReader & Pick<AssetFiles, 'signFile'>;
  private readonly fileUrls: FileUrls;
  private readonly uow: PostUnitOfWork;
  private readonly scheduler: Pick<Scheduler, 'at' | 'cancel'>;
  private readonly logger: Logger;

  constructor(params: PostServiceParams) {
    this.repo = params.repo;
    this.access = params.access;
    this.content = params.content;
    this.authors = params.authors;
    this.profiles = params.profiles;
    this.comments = params.comments;
    this.subscriptions = params.subscriptions;
    this.mentions = params.mentions;
    this.images = params.images;
    this.fileUrls = params.fileUrls;
    this.uow = params.uow;
    this.scheduler = params.scheduler;
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

  publishedBetween(
    orgId: string,
    communityId: string,
    from: Date,
    to: Date,
  ): Promise<PublishedPost[]> {
    return this.repo.publishedBetween(orgId, communityId, from, to);
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
    const mentioned = await this.mentionable(orgId, space.id, post.title, post.body);
    const saved = await this.uow.run(async ({ posts, mentions, outbox }) => {
      const created = await posts.insert(orgId, post);
      await mentions.sync(orgId, 'post', created.id, mentioned, now);
      const events: NewDiscussionEvent[] = [
        discussionEvents.postCreated.make({
          orgId,
          data: created,
          metadata: this.meta(actor, created.status === 'pending' ? null : undefined),
        }),
      ];
      if (created.status === 'published') {
        events.push(this.published(orgId, created, this.meta(actor, null), mentioned));
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
    if (saved.status === 'scheduled') {
      await this.arm(orgId, actor, saved, null);
    }
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
    const retext = patch.title !== undefined || patch.body !== undefined;
    const candidates = retext
      ? await this.mentionable(
          orgId,
          post.spaceId,
          patch.title ?? post.title,
          patch.body ?? post.body,
        )
      : [];
    const updated = await this.uow.run(async ({ posts, mentions, outbox }) => {
      const next = await this.mustUpdate(posts, orgId, postId, patch);
      const added = retext
        ? await mentions.sync(orgId, 'post', postId, candidates, new Date())
        : [];
      await outbox.append([
        this.updated(
          orgId,
          next,
          this.meta(actor, next.status === 'pending' ? post.status : undefined),
          next.status === 'published' ? keepAllowed(candidates, added) : [],
        ),
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
    if (post.status === 'scheduled') {
      await this.disarm(orgId, postId);
    }
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
      const next = await posts.updateIf(
        orgId,
        postId,
        { status: post.status },
        { status: 'scheduled', scheduledAt, publishedAt: null, removedBy: null },
      );
      if (!next) {
        throw new ConflictError('This post cannot be scheduled');
      }
      await outbox.append([this.updated(orgId, next, this.meta(actor, post.status))]);
      return next;
    });
    this.logger.info('post scheduled', {
      orgId,
      postId,
      scheduledAt: scheduledAt.toISOString(),
      actorId: actor.id,
    });
    await this.arm(orgId, actor, updated, post.status === 'scheduled' ? post.scheduledAt : null);
    return this.viewOf(orgId, actor, updated);
  }

  async unschedule(orgId: string, postId: string, actor: Actor): Promise<PostView> {
    const { post } = await this.loadVisible(orgId, actor, postId);
    this.assertAuthor(actor, post);
    if (post.status !== 'scheduled') {
      throw new ConflictError('This post is not scheduled');
    }
    const updated = await this.uow.run(async ({ posts, outbox }) => {
      const next = await posts.updateIf(orgId, postId, { status: 'scheduled' }, DRAFT);
      if (!next) {
        throw new ConflictError('This post is not scheduled');
      }
      await outbox.append([this.updated(orgId, next, this.meta(actor, post.status))]);
      return next;
    });
    this.logger.info('post unscheduled', { orgId, postId, actorId: actor.id });
    await this.disarm(orgId, postId);
    return this.viewOf(orgId, actor, updated);
  }

  async publishScheduled(orgId: string, postId: string, now: Date): Promise<void> {
    const post = await this.repo.find(orgId, postId);
    if (!post || post.status !== 'scheduled' || post.scheduledAt === null) {
      this.logger.debug('scheduled post no longer scheduled', { orgId, postId });
      return;
    }
    if (post.scheduledAt > now) {
      await this.scheduler.at(POST_PUBLISH_JOB, post.scheduledAt, postId, { orgId, postId });
      this.logger.info('scheduled post timer moved', {
        orgId,
        postId,
        scheduledAt: post.scheduledAt.toISOString(),
      });
      return;
    }
    const space = await this.content.getSpace(orgId, post.spaceId);
    if (!space) {
      this.logger.error('scheduled post has no space', { orgId, postId, spaceId: post.spaceId });
      return;
    }
    const role = await this.authors.roleOf(orgId, post.orgUserId);
    const refused = !(await this.submittable(orgId, post, space, role));
    const patch = refused ? DRAFT : this.submissionOf(space.settings.requireReview, role, now);
    const saved = await this.uow.run(async ({ posts, mentions, outbox }) => {
      const next = await posts.updateIf(orgId, postId, { status: 'scheduled', dueBy: now }, patch);
      if (!next) {
        return null;
      }
      await outbox.append([await this.landed(mentions, orgId, next, this.meta(null, post.status))]);
      return next;
    });
    if (!saved) {
      this.logger.debug('scheduled post already handled', { orgId, postId });
      return;
    }
    this.logger.info('scheduled post submitted', { orgId, postId, status: saved.status, refused });
  }

  private async arm(
    orgId: string,
    actor: Actor,
    post: Post,
    previousScheduledAt: Date | null,
  ): Promise<void> {
    if (post.scheduledAt === null) {
      return;
    }
    try {
      await this.scheduler.at(POST_PUBLISH_JOB, post.scheduledAt, post.id, {
        orgId,
        postId: post.id,
      });
      return;
    } catch (err) {
      this.logger.error('post timer not set', { orgId, postId: post.id, err });
    }
    await this.uow.run(async ({ posts, outbox }) => {
      const reverted = await posts.updateIf(
        orgId,
        post.id,
        { status: 'scheduled', scheduledAt: post.scheduledAt! },
        previousScheduledAt ? { scheduledAt: previousScheduledAt } : DRAFT,
      );
      if (!reverted) {
        return;
      }
      await outbox.append([
        this.updated(
          orgId,
          reverted,
          this.meta(actor, reverted.status === 'draft' ? post.status : undefined),
        ),
      ]);
    });
    throw new UnavailableError('The post could not be scheduled; try again', { postId: post.id });
  }

  private async disarm(orgId: string, postId: string): Promise<void> {
    try {
      await this.scheduler.cancel(POST_PUBLISH_JOB, postId);
    } catch (err) {
      this.logger.warn('post timer not cancelled', { orgId, postId, err });
    }
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
    const updated = await this.uow.run(async ({ posts, mentions, outbox }) => {
      const next = await this.mustUpdate(posts, orgId, postId, {
        status: 'published',
        publishedAt: now,
        scheduledAt: null,
        removedBy: null,
      });
      await outbox.append([
        await this.landed(mentions, orgId, next, this.meta(actor, post.status)),
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
      await outbox.append([
        next.status === 'published'
          ? this.published(orgId, next, metadata, [])
          : this.updated(orgId, next, metadata),
      ]);
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
    await this.uow.run(async ({ posts, outbox }) => {
      const first = await posts.setReaction(orgId, postId, actor.id, emoji);
      if (!first || emoji === null) {
        return;
      }
      await outbox.append([
        discussionEvents.postReactionAdded.make({
          orgId,
          data: {
            postId,
            spaceId: post.spaceId,
            communityId: post.communityId,
            orgUserId: actor.id,
            reaction: emoji,
          },
          metadata: this.meta(actor),
        }),
      ]);
    });
    this.logger.debug('post reaction set', { orgId, postId, orgUserId: actor.id });
    const counts = await this.repo.reactionsOf(orgId, [postId], actor.id);
    return counts[postId] ?? { reactions: {} };
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
      this.repo.listPending(orgId, spaceId, MODERATION_QUEUE_LIMIT),
      this.repo.listOpenFlags(orgId, spaceId, MODERATION_QUEUE_LIMIT),
      this.comments.listOpenFlagsForSpace(orgId, spaceId, MODERATION_QUEUE_LIMIT),
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
    const now = new Date();
    const [records, reactions, commentCounts, subscribed, bookmarked, mentioned] =
      await Promise.all([
        this.profiles.authorsOf(orgId, [...new Set(posts.map((post) => post.orgUserId))]),
        this.repo.reactionsOf(orgId, postIds, actor.id),
        this.comments.publishedCommentCounts(orgId, postIds),
        this.subscriptions.forViewer(orgId, actor.id, 'post', postIds),
        this.repo.bookmarkedAmong(orgId, postIds, actor.id),
        mentionViews(this.mentions, this.profiles, orgId, 'post', postIds),
      ]);
    const subscriptionOf = new Map(subscribed.map((row) => [row.itemId, row]));
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
        subscription: activeSubscription(subscriptionOf.get(post.id), now),
        bookmarked: saved.has(post.id),
        mentions: mentioned[post.id] ?? [],
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
    return this.uow.run(async ({ posts, mentions, outbox }) => {
      const next = await posts.updateIf(
        orgId,
        post.id,
        { status: post.status },
        this.submissionOf(space.settings.requireReview, role, now),
      );
      if (!next) {
        throw new ConflictError('This post cannot be submitted');
      }
      await outbox.append([
        await this.landed(mentions, orgId, next, this.meta(actor, post.status)),
      ]);
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
        this.updated(
          orgId,
          next,
          this.meta(actor, next.status === 'pending' ? post.status : undefined),
        ),
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

  private async openSpace(
    orgId: string,
    actor: Actor,
    spaceId: string,
    communityId?: string,
  ): Promise<SpaceDetail | null> {
    const space = await this.content.getSpace(orgId, spaceId);
    if (!space || (communityId !== undefined && space.communityId !== communityId)) {
      return null;
    }
    return (await this.access.canOpen(orgId, actor, space)) ? space : null;
  }

  private async requireOpen(
    orgId: string,
    actor: Actor,
    spaceId: string,
    communityId?: string,
  ): Promise<SpaceDetail> {
    const space = await this.openSpace(orgId, actor, spaceId, communityId);
    if (!space) {
      throw new NotFoundError('Space', spaceId);
    }
    return space;
  }

  private async loadVisible(orgId: string, actor: Actor, postId: string, communityId?: string) {
    const post = await this.repo.find(orgId, postId);
    if (!post || (communityId !== undefined && post.communityId !== communityId)) {
      throw new NotFoundError('Post', postId);
    }
    const space = await this.openSpace(orgId, actor, post.spaceId);
    if (!space || !this.canSee(actor, post)) {
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

  private async mentionable(
    orgId: string,
    spaceId: string,
    title: string,
    body: string,
  ): Promise<string[]> {
    return this.openersOf(orgId, spaceId, mentionTokens(title, body));
  }

  private async openersOf(orgId: string, spaceId: string, orgUserIds: string[]): Promise<string[]> {
    if (orgUserIds.length === 0) {
      return [];
    }
    return keepAllowed(orgUserIds, await this.access.spaceOpenersAmong(orgId, spaceId, orgUserIds));
  }

  private async landed(
    mentions: MentionsRepository,
    orgId: string,
    post: Post,
    metadata: EventMeta,
  ): Promise<NewDiscussionEvent> {
    if (post.status !== 'published') {
      return this.updated(orgId, post, metadata);
    }
    const mentioned = await this.openersOf(
      orgId,
      post.spaceId,
      await mentions.ofItem(orgId, 'post', post.id),
    );
    return this.published(orgId, post, metadata, mentioned);
  }

  private published(
    orgId: string,
    post: Post,
    metadata: EventMeta,
    mentionedOrgUserIds: string[],
  ): NewDiscussionEvent {
    return discussionEvents.postPublished.make({
      orgId,
      data: { ...post, mentionedOrgUserIds },
      metadata,
    });
  }

  private updated(
    orgId: string,
    post: Post,
    metadata: EventMeta,
    mentionedOrgUserIds: string[] = [],
  ): NewDiscussionEvent {
    return discussionEvents.postUpdated.make({
      orgId,
      data: { ...post, mentionedOrgUserIds },
      metadata,
    });
  }

  private meta(actor: Actor | null, previousStatus?: PostStatus | null): EventMeta {
    return {
      ...(actor ? { actorOrgUserId: actor.id } : {}),
      ...(previousStatus !== undefined ? { previousStatus } : {}),
    };
  }
}
