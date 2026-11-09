import { genId } from '../shared/id.js';
import {
  ConflictError,
  ForbiddenError,
  InvalidInputError,
  NotFoundError,
  UnavailableError,
} from '../shared/errors.js';
import type { BodyParser, Logger, Scheduler } from '../shared/ports.js';
import { noopLogger } from '../shared/logger.js';
import type { SpaceDetail } from '../content/index.js';
import type {
  AssetFiles,
  FileUrls,
  MemberImageReader,
  MemberUploadReader,
} from '../assets/index.js';
import type {
  FlaggedComment,
  FlaggedCommentView,
  Post,
  PostFlag,
  PostFlagResolution,
  PostStatus,
  PostView,
} from '../types/index.js';
import type { Actor, EffectivePermissions } from '../shared/actor.js';
import type { NewDiscussionEvent } from './events.js';
import { discussionEvents } from './events.js';
import { authorView } from './authors.js';
import { POST_PUBLISH_JOB } from './jobs.js';
import { activeSubscription } from './subscriptions.js';
import { keepAllowed, mentionTokens, mentionViews } from './mentions.js';
import { skipsReview, teamBadge } from './rules.js';
import type {
  AuthorPermissionReader,
  AuthorProfileReader,
  CommunityAccess,
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
  SpaceReader,
  SubscriptionsRepository,
  UpdatePostInput,
  PublishedPost,
} from './ports.js';
import { MODERATION_QUEUE_LIMIT } from './ports.js';
import type { Page, ReactionEmoji } from './types.js';

export type PostServiceParams = {
  repo: PostRepository;
  access: CommunityAccess;
  content: Pick<SpaceReader, 'getSpace'>;
  authors: AuthorPermissionReader;
  profiles: AuthorProfileReader;
  comments: PostCommentReader;
  subscriptions: SubscriptionsRepository;
  mentions: MentionsRepository;
  images: MemberImageReader &
    MemberUploadReader &
    Pick<AssetFiles, 'signFile' | 'syncPublicImages'>;
  fileUrls: FileUrls;
  bodies: BodyParser;
  uow: PostUnitOfWork;
  scheduler: Pick<Scheduler, 'at' | 'cancel'>;
  logger?: Logger;
};

type EventMeta = { actorId?: string; previousStatus?: PostStatus | null };

const MAX_BODY_ASSETS = 20;
const INLINE_TYPES = /^(image\/(png|jpeg|gif|webp|avif)|video\/.+|audio\/.+|application\/pdf)$/i;
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
  private readonly access: CommunityAccess;
  private readonly content: Pick<SpaceReader, 'getSpace'>;
  private readonly authors: AuthorPermissionReader;
  private readonly profiles: AuthorProfileReader;
  private readonly comments: PostCommentReader;
  private readonly subscriptions: SubscriptionsRepository;
  private readonly mentions: MentionsRepository;
  private readonly images: MemberImageReader &
    MemberUploadReader &
    Pick<AssetFiles, 'signFile' | 'syncPublicImages'>;
  private readonly fileUrls: FileUrls;
  private readonly bodies: BodyParser;
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
    this.bodies = params.bodies;
    this.uow = params.uow;
    this.scheduler = params.scheduler;
    this.logger = params.logger ?? noopLogger;
  }

  async visibleTitles(postIds: string[], actor: Actor): Promise<Record<string, string>> {
    const orgId = actor.orgId;
    const found = await this.repo.findMany(orgId, [...new Set(postIds)]);
    const communityIds = [...new Set(found.map((post) => post.communityId))];
    const open = new Set(
      (
        await Promise.all(
          communityIds.map((communityId) => this.access.openSpaceIds(communityId, actor)),
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

  async create(input: CreatePostInput, actor: Actor): Promise<PostView> {
    const orgId = actor.orgId;
    const space = await this.requireOpen(actor, input.spaceId, input.communityId);
    await this.requireOwnedImage(orgId, actor.id, input.coverAssetId);
    const parsed = this.bodies.parse(input.body);
    await this.requireBodyAssets(orgId, actor.id, parsed.assetIds);
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
    const mentioned = await this.mentionable(orgId, space.id, post.title, parsed.mentions);
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
    await this.syncCover(saved);
    return this.viewOf(actor, saved);
  }

  async update(postId: string, patch: UpdatePostInput, actor: Actor): Promise<PostView> {
    const orgId = actor.orgId;
    const { post, space } = await this.loadVisible(actor, postId);
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
    const parsed = this.bodies.parse(patch.body ?? post.body);
    if (patch.body !== undefined) {
      await this.requireBodyAssets(orgId, actor.id, parsed.assetIds);
    }
    if (!this.patchChanges(post, patch)) {
      return this.viewOf(actor, post);
    }
    const retext = patch.title !== undefined || patch.body !== undefined;
    const candidates = retext
      ? await this.mentionable(orgId, post.spaceId, patch.title ?? post.title, parsed.mentions)
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
    await this.syncCover(updated);
    return this.viewOf(actor, updated);
  }

  async submit(postId: string, actor: Actor): Promise<PostView> {
    const orgId = actor.orgId;
    const { post, space } = await this.loadVisible(actor, postId);
    this.assertAuthor(actor, post);
    if (post.status !== 'draft' && post.status !== 'scheduled') {
      throw new ConflictError('This post cannot be submitted');
    }
    this.assertTopic(space, post.topicId);
    const saved = await this.commitSubmission(
      orgId,
      post,
      space,
      skipsReview(actor.permissions, { communityId: post.communityId }),
      actor,
      new Date(),
    );
    this.logger.info('post submitted', { orgId, postId, status: saved.status, actorId: actor.id });
    if (post.status === 'scheduled') {
      await this.disarm(orgId, postId);
    }
    await this.syncCover(saved);
    return this.viewOf(actor, saved);
  }

  async schedule(postId: string, scheduledAt: Date, actor: Actor): Promise<PostView> {
    const orgId = actor.orgId;
    const { post } = await this.loadVisible(actor, postId);
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
    await this.syncCover(updated);
    return this.viewOf(actor, updated);
  }

  async unschedule(postId: string, actor: Actor): Promise<PostView> {
    const orgId = actor.orgId;
    const { post } = await this.loadVisible(actor, postId);
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
    await this.syncCover(updated);
    return this.viewOf(actor, updated);
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
    const space = await this.content.getSpace(post.spaceId, this.authors.systemActor(orgId));
    if (!space) {
      this.logger.error('scheduled post has no space', { orgId, postId, spaceId: post.spaceId });
      return;
    }
    const author = await this.authors.actorFor(orgId, post.orgUserId);
    const refused = author === null || !(await this.submittable(post, space, author));
    const patch =
      author === null || refused
        ? DRAFT
        : this.submissionOf(
            space.settings.requireReview,
            skipsReview(author.permissions, { communityId: post.communityId }),
            now,
          );
    const mentioned = await this.mentionedOpeners(orgId, post);
    const saved = await this.uow.run(async ({ posts, outbox }) => {
      const next = await posts.updateIf(orgId, postId, { status: 'scheduled', dueBy: now }, patch);
      if (!next) {
        return null;
      }
      await outbox.append([this.landed(orgId, next, this.meta(null, post.status), mentioned)]);
      return next;
    });
    if (!saved) {
      this.logger.debug('scheduled post already handled', { orgId, postId });
      return;
    }
    this.logger.info('scheduled post submitted', { orgId, postId, status: saved.status, refused });
    await this.syncCover(saved);
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

  private syncCover(post: Post): Promise<void> {
    return this.images.syncPublicImages(
      post.orgId,
      post.id,
      post.status === 'published' && post.coverAssetId ? [post.coverAssetId] : [],
    );
  }

  private async disarm(orgId: string, postId: string): Promise<void> {
    try {
      await this.scheduler.cancel(POST_PUBLISH_JOB, postId);
    } catch (err) {
      this.logger.warn('post timer not cancelled', { orgId, postId, err });
    }
  }

  async approve(postId: string, communityId: string | null, actor: Actor): Promise<PostView> {
    const orgId = actor.orgId;
    const { post } = await this.loadVisible(actor, postId, communityId);
    this.requireModerator(actor, post, 'approve');
    if (post.status !== 'pending') {
      throw new ConflictError('This post is not awaiting review');
    }
    const now = new Date();
    const mentioned = await this.mentionedOpeners(orgId, post);
    const updated = await this.uow.run(async ({ posts, outbox }) => {
      const next = await this.mustUpdate(posts, orgId, postId, {
        status: 'published',
        publishedAt: now,
        scheduledAt: null,
        removedBy: null,
      });
      await outbox.append([this.landed(orgId, next, this.meta(actor, post.status), mentioned)]);
      return next;
    });
    this.logger.info('post approved', { orgId, postId, actorId: actor.id });
    await this.syncCover(updated);
    return this.viewOf(actor, updated);
  }

  async remove(postId: string, communityId: string | null, actor: Actor): Promise<PostView> {
    const orgId = actor.orgId;
    const { post } = await this.loadVisible(actor, postId, communityId);
    if (post.orgUserId !== actor.id) {
      this.requireModerator(actor, post, 'remove');
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
    await this.syncCover(updated);
    return this.viewOf(actor, updated);
  }

  async restore(postId: string, communityId: string | null, actor: Actor): Promise<PostView> {
    const orgId = actor.orgId;
    const { post, space } = await this.loadVisible(actor, postId, communityId);
    this.requireModerator(actor, post, 'restore');
    if (post.status !== 'removed') {
      throw new ConflictError('This post was not removed');
    }
    const now = new Date();
    const author = (await this.authors.permissionsOfMany(orgId, [post.orgUserId])).get(
      post.orgUserId,
    );
    const skips = author !== undefined && skipsReview(author, { communityId: post.communityId });
    const updated = await this.uow.run(async ({ posts, outbox }) => {
      const next = await this.mustUpdate(
        posts,
        orgId,
        postId,
        this.submissionOf(space.settings.requireReview, skips, now),
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
    await this.syncCover(updated);
    return this.viewOf(actor, updated);
  }

  pin(postId: string, actor: Actor): Promise<PostView> {
    return this.moderate(postId, actor, { pinned: true }, (post) => post.pinned, 'post pinned');
  }

  unpin(postId: string, actor: Actor): Promise<PostView> {
    return this.moderate(postId, actor, { pinned: false }, (post) => !post.pinned, 'post unpinned');
  }

  closeComments(postId: string, actor: Actor): Promise<PostView> {
    return this.moderate(
      postId,
      actor,
      { commentsClosed: true },
      (post) => post.commentsClosed === true,
      'post comments closed',
    );
  }

  openComments(postId: string, actor: Actor): Promise<PostView> {
    return this.moderate(
      postId,
      actor,
      { commentsClosed: false },
      (post) => post.commentsClosed === false,
      'post comments opened',
    );
  }

  setReactions(postId: string, enabled: boolean, actor: Actor): Promise<PostView> {
    return this.moderate(
      postId,
      actor,
      { reactionsEnabled: enabled },
      (post) => post.reactionsEnabled === enabled,
      'post reactions changed',
    );
  }

  async setReaction(
    postId: string,
    emoji: ReactionEmoji | null,
    actor: Actor,
  ): Promise<PostReactions> {
    const orgId = actor.orgId;
    const { post, space } = await this.loadVisible(actor, postId);
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

  async bookmark(postId: string, actor: Actor): Promise<void> {
    const orgId = actor.orgId;
    await this.loadVisible(actor, postId);
    await this.repo.bookmark(orgId, postId, actor.id);
    this.logger.debug('post bookmarked', { orgId, postId, orgUserId: actor.id });
  }

  async unbookmark(postId: string, actor: Actor): Promise<void> {
    const orgId = actor.orgId;
    await this.loadVisible(actor, postId);
    await this.repo.unbookmark(orgId, postId, actor.id);
    this.logger.debug('post unbookmarked', { orgId, postId, orgUserId: actor.id });
  }

  async flag(postId: string, reason: string, actor: Actor): Promise<PostFlag> {
    const orgId = actor.orgId;
    const { post } = await this.loadVisible(actor, postId);
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
    postId: string,
    resolution: Extract<PostFlagResolution, 'dismissed'>,
    communityId: string | null,
    actor: Actor,
  ): Promise<void> {
    const orgId = actor.orgId;
    const { post } = await this.loadVisible(actor, postId, communityId);
    this.requireModerator(actor, post, 'resolve flags');
    await this.repo.resolveFlags(orgId, postId, {
      resolvedAt: new Date(),
      resolvedBy: actor.id,
      resolution,
    });
    this.logger.info('post flags resolved', { orgId, postId, resolution, actorId: actor.id });
  }

  async spaceFeed(
    communityId: string,
    spaceId: string,
    query: FeedQuery,
    actor: Actor,
  ): Promise<Page<PostView>> {
    const orgId = actor.orgId;
    const space = await this.requireOpen(actor, spaceId, communityId);
    if (query.topicId && !space.topics.some((topic) => topic.id === query.topicId)) {
      throw new NotFoundError('Topic', query.topicId);
    }
    const page = await this.feedPage(actor, [spaceId], query);
    this.logger.debug('space feed read', { orgId, spaceId, rows: page.rows.length });
    return page;
  }

  async memberFeed(
    communityId: string,
    query: Pick<FeedQuery, 'page' | 'pageSize'>,
    actor: Actor,
  ): Promise<Page<PostView>> {
    const orgId = actor.orgId;
    const spaceIds = await this.openSpaceIdsIn(actor, communityId);
    const page = await this.feedPage(actor, spaceIds, query);
    this.logger.debug('member feed read', {
      orgId,
      communityId,
      spaces: spaceIds.length,
      rows: page.rows.length,
    });
    return page;
  }

  private async openSpaceIdsIn(actor: Actor, communityId: string): Promise<string[]> {
    if (!(await this.access.isCommunityMember(communityId, actor))) {
      throw new NotFoundError('Community', communityId);
    }
    return this.access.openSpaceIds(communityId, actor);
  }

  async listOwn(communityId: string, query: PageQuery, actor: Actor): Promise<Page<PostView>> {
    const orgId = actor.orgId;
    const spaceIds = await this.openSpaceIdsIn(actor, communityId);
    const page = await this.repo.listByAuthor(orgId, actor.id, spaceIds, query);
    this.logger.debug('own posts read', { orgId, communityId, rows: page.rows.length });
    return { ...page, rows: await this.viewsOf(actor, page.rows) };
  }

  async listBookmarked(
    communityId: string,
    query: PageQuery,
    actor: Actor,
  ): Promise<Page<PostView>> {
    const orgId = actor.orgId;
    const spaceIds = await this.openSpaceIdsIn(actor, communityId);
    const page = await this.repo.listBookmarked(orgId, actor.id, spaceIds, {
      ...query,
      visibleStatuses: this.visibleStatuses(actor, communityId),
    });
    this.logger.debug('bookmarked posts read', { orgId, communityId, rows: page.rows.length });
    return { ...page, rows: await this.viewsOf(actor, page.rows) };
  }

  async coverFile(postId: string, actor: Actor): Promise<string> {
    const post = await this.repo.find(actor.orgId, postId);
    return this.signShown(actor, post, post?.coverAssetId ?? null, 'Post cover', postId);
  }

  async assetFile(postId: string, assetId: string, actor: Actor): Promise<string> {
    const post = await this.repo.find(actor.orgId, postId);
    const shown = post !== null && this.bodies.parse(post.body).assetIds.includes(assetId);
    const [upload] = shown ? await this.images.memberUploads(actor.orgId, [assetId]) : [];
    return this.signShown(
      actor,
      post,
      upload ? assetId : null,
      'Post file',
      assetId,
      upload && !INLINE_TYPES.test(upload.contentType) ? upload.filename : undefined,
    );
  }

  private async signShown(
    actor: Actor,
    post: Post | null,
    assetId: string | null,
    label: string,
    id: string,
    saveAs?: string,
  ): Promise<string> {
    const orgId = actor.orgId;
    if (!post || !assetId || !this.canSee(actor, post)) {
      throw new NotFoundError(label, id);
    }
    const space = await this.content.getSpace(post.spaceId, this.authors.systemActor(orgId));
    if (!space || !(await this.access.canOpen(space, actor))) {
      throw new NotFoundError(label, id);
    }
    const url = await this.images.signFile(orgId, assetId, saveAs ? { saveAs } : {});
    if (!url) {
      throw new NotFoundError(label, id);
    }
    return url;
  }

  async getPost(postId: string, actor: Actor): Promise<PostView> {
    const { post } = await this.loadVisible(actor, postId);
    this.logger.debug('post read', { orgId: actor.orgId, postId });
    return this.viewOf(actor, post);
  }

  async moderationQueue(
    communityId: string,
    spaceId: string,
    actor: Actor,
  ): Promise<SpaceModerationQueue> {
    const orgId = actor.orgId;
    const space = await this.requireOpen(actor, spaceId, communityId);
    if (!actor.permissions.has('communities:moderate', space.communityId)) {
      this.logger.warn('space queue refused — not a moderator', {
        orgId,
        communityId,
        spaceId,
        actorId: actor.id,
      });
      throw new ForbiddenError('You need communities:moderate');
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
      pending: await this.viewsOf(actor, pending),
      flags,
      commentFlags: await this.flaggedCommentViews(actor, space.communityId, openCommentFlags),
    };
  }

  private async flaggedCommentViews(
    actor: Actor,
    communityId: string,
    flags: FlaggedComment[],
  ): Promise<FlaggedCommentView[]> {
    if (flags.length === 0) {
      return [];
    }
    const orgId = actor.orgId;
    const authorIds = [...new Set(flags.map((flag) => flag.comment.orgUserId))];
    const [records, permissions] = await Promise.all([
      this.profiles.authorsOf(orgId, authorIds),
      this.authors.permissionsOfMany(orgId, authorIds),
    ]);
    return flags.map((flag) => {
      const record = records[flag.comment.orgUserId];
      if (!record) {
        throw new NotFoundError('Member', flag.comment.orgUserId);
      }
      return {
        ...flag,
        comment: {
          ...flag.comment,
          author: authorView(
            orgId,
            record,
            this.fileUrls,
            teamBadge(permissions.get(flag.comment.orgUserId), communityId),
          ),
        },
      };
    });
  }

  visible(postId: string, actor: Actor): Promise<{ post: Post; space: SpaceDetail }> {
    return this.loadVisible(actor, postId);
  }

  find(orgId: string, postId: string): Promise<Post | null> {
    return this.repo.find(orgId, postId);
  }

  private async submittable(post: Post, space: SpaceDetail, author: Actor): Promise<boolean> {
    if (!this.topicFits(space, post.topicId)) {
      return false;
    }
    return this.access.canOpen(space, author);
  }

  private async feedPage(
    actor: Actor,
    spaceIds: string[],
    query: FeedQuery,
  ): Promise<Page<PostView>> {
    const page = await this.repo.listPublished(actor.orgId, spaceIds, query);
    return { ...page, rows: await this.viewsOf(actor, page.rows) };
  }

  private async viewOf(actor: Actor, post: Post): Promise<PostView> {
    const [view] = await this.viewsOf(actor, [post]);
    return view!;
  }

  private async viewsOf(actor: Actor, posts: Post[]): Promise<PostView[]> {
    if (posts.length === 0) {
      return [];
    }
    const orgId = actor.orgId;
    const postIds = posts.map((post) => post.id);
    const authorIds = [...new Set(posts.map((post) => post.orgUserId))];
    const now = new Date();
    const bodyAssets = new Map(
      posts.map((post) => [post.id, this.bodies.parse(post.body).assetIds]),
    );
    const [
      records,
      permissions,
      reactions,
      commentCounts,
      subscribed,
      bookmarked,
      mentioned,
      uploads,
    ] = await Promise.all([
      this.profiles.authorsOf(orgId, authorIds),
      this.authors.permissionsOfMany(orgId, authorIds),
      this.repo.reactionsOf(orgId, postIds, actor.id),
      this.comments.publishedCommentCounts(orgId, postIds),
      this.subscriptions.forViewer(orgId, actor.id, 'post', postIds),
      this.repo.bookmarkedAmong(orgId, postIds, actor.id),
      mentionViews(this.mentions, this.profiles, orgId, 'post', postIds),
      this.images.memberUploads(orgId, [...new Set([...bodyAssets.values()].flat())]),
    ]);
    const uploadOf = new Map(uploads.map((upload) => [upload.id, upload]));
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
        coverUrl: !post.coverAssetId
          ? null
          : post.status === 'published'
            ? this.fileUrls.publicImage(orgId, post.id, post.coverAssetId)
            : this.fileUrls.postCover(post.id),
        assets: Object.fromEntries(
          (bodyAssets.get(post.id) ?? []).flatMap((assetId) => {
            const upload = uploadOf.get(assetId);
            return upload
              ? [
                  [
                    assetId,
                    {
                      url: this.fileUrls.postAsset(post.id, assetId),
                      kind: upload.kind,
                      filename: upload.filename,
                      size: upload.size,
                    },
                  ],
                ]
              : [];
          }),
        ),
        author: authorView(
          orgId,
          record,
          this.fileUrls,
          teamBadge(permissions.get(post.orgUserId), post.communityId),
        ),
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
    skips: boolean,
    actor: Actor,
    now: Date,
  ): Promise<Post> {
    const mentioned = await this.mentionedOpeners(orgId, post);
    return this.uow.run(async ({ posts, outbox }) => {
      const next = await posts.updateIf(
        orgId,
        post.id,
        { status: post.status },
        this.submissionOf(space.settings.requireReview, skips, now),
      );
      if (!next) {
        throw new ConflictError('This post cannot be submitted');
      }
      await outbox.append([this.landed(orgId, next, this.meta(actor, post.status), mentioned)]);
      return next;
    });
  }

  private async moderate(
    postId: string,
    actor: Actor,
    patch: PostPatch,
    unchanged: (post: Post) => boolean,
    log: string,
  ): Promise<PostView> {
    const orgId = actor.orgId;
    const { post } = await this.loadVisible(actor, postId);
    this.requireModerator(actor, post, log);
    if (post.status === 'removed') {
      throw new ConflictError('This post was removed');
    }
    if (unchanged(post)) {
      return this.viewOf(actor, post);
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
    return this.viewOf(actor, updated);
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
    return this.submissionOf(
      space.settings.requireReview,
      skipsReview(actor.permissions, { communityId: space.communityId }),
      now,
    );
  }

  private submissionOf(requireReview: boolean, skips: boolean, now: Date) {
    if (requireReview && !skips) {
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

  private async requireBodyAssets(
    orgId: string,
    orgUserId: string,
    assetIds: string[],
  ): Promise<void> {
    if (assetIds.length > MAX_BODY_ASSETS) {
      throw new InvalidInputError(`A post shows at most ${MAX_BODY_ASSETS} files`);
    }
    for (const assetId of assetIds) {
      if (!(await this.images.ownsUpload(orgId, assetId, orgUserId))) {
        this.logger.debug('body file refused', { orgId, orgUserId, assetId });
        throw new NotFoundError('Asset', assetId);
      }
    }
  }

  private async openSpace(
    actor: Actor,
    spaceId: string,
    communityId?: string | null,
  ): Promise<SpaceDetail | null> {
    const space = await this.content.getSpace(spaceId, this.authors.systemActor(actor.orgId));
    if (!space || (communityId != null && space.communityId !== communityId)) {
      return null;
    }
    return (await this.access.canOpen(space, actor)) ? space : null;
  }

  private async requireOpen(
    actor: Actor,
    spaceId: string,
    communityId?: string,
  ): Promise<SpaceDetail> {
    const space = await this.openSpace(actor, spaceId, communityId);
    if (!space) {
      throw new NotFoundError('Space', spaceId);
    }
    return space;
  }

  private async loadVisible(actor: Actor, postId: string, communityId?: string | null) {
    const post = await this.repo.find(actor.orgId, postId);
    if (!post || (communityId != null && post.communityId !== communityId)) {
      throw new NotFoundError('Post', postId);
    }
    const space = await this.openSpace(actor, post.spaceId);
    if (!space || !this.canSee(actor, post)) {
      throw new NotFoundError('Post', postId);
    }
    return { post, space };
  }

  private canSee(actor: Actor, post: Post): boolean {
    return (
      post.orgUserId === actor.id ||
      this.visibleStatuses(actor, post.communityId).includes(post.status)
    );
  }

  private visibleStatuses(actor: Actor, communityId: string): PostStatus[] {
    return this.moderates(actor.permissions, communityId) ? MODERATOR_VISIBLE : PUBLISHED_ONLY;
  }

  private moderates(permissions: EffectivePermissions, communityId: string): boolean {
    return permissions.has('communities:moderate', communityId);
  }

  private requireModerator(actor: Actor, post: Post, action: string): void {
    if (!this.moderates(actor.permissions, post.communityId)) {
      this.logger.warn('post moderation refused — not a moderator', {
        orgId: actor.orgId,
        postId: post.id,
        communityId: post.communityId,
        action,
        actorId: actor.id,
      });
      throw new ForbiddenError('You need communities:moderate');
    }
  }

  private assertAuthor(actor: Actor, post: Post): void {
    if (post.orgUserId !== actor.id) {
      throw new ForbiddenError('You can change only your own post');
    }
  }

  private topicFits(space: SpaceDetail, topicId: string | null): boolean {
    return topicId === null || space.topics.some((topic) => topic.id === topicId);
  }

  private assertTopic(space: SpaceDetail, topicId: string | null): void {
    if (topicId !== null && !this.topicFits(space, topicId)) {
      throw new NotFoundError('Topic', topicId);
    }
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
    body: string[],
  ): Promise<string[]> {
    return this.openersOf(orgId, spaceId, [...new Set([...mentionTokens(title), ...body])]);
  }

  private async openersOf(orgId: string, spaceId: string, orgUserIds: string[]): Promise<string[]> {
    if (orgUserIds.length === 0) {
      return [];
    }
    return keepAllowed(orgUserIds, await this.access.spaceOpenersAmong(orgId, spaceId, orgUserIds));
  }

  private async mentionedOpeners(orgId: string, post: Post): Promise<string[]> {
    return this.openersOf(orgId, post.spaceId, await this.mentions.ofItem(orgId, 'post', post.id));
  }

  private landed(
    orgId: string,
    post: Post,
    metadata: EventMeta,
    mentioned: string[],
  ): NewDiscussionEvent {
    if (post.status !== 'published') {
      return this.updated(orgId, post, metadata);
    }
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
      ...(actor ? { actorId: actor.id } : {}),
      ...(previousStatus !== undefined ? { previousStatus } : {}),
    };
  }
}
