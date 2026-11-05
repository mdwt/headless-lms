import { genId } from '../shared/id.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../shared/errors.js';
import type { Logger } from '../shared/ports.js';
import { noopLogger } from '../shared/logger.js';
import type { EffectivePermissions } from '../shared/actor.js';
import type { Comment, CommentReport, CommentSettings } from './model.js';
import type {
  Activity,
  ActivitySettings,
  CourseSettings,
  MentionView,
  Post,
  SpaceDetail,
} from '../types/index.js';
import type {
  CommentListItem,
  CommentsConfig,
  CommentView,
  ListCommentsQuery,
  Page,
  ReactionEmoji,
} from './types.js';
import { SettingsNamespace, type SettingsService } from '../shared/settings.js';
import type {
  ActivityComments,
  ActivityGetter,
  Actor,
  AuthorPermissionReader,
  AuthorRecord,
  CommentReactions,
  CommentWithin,
  CommunityAccess,
  ContentAccessReader,
  DiscussionRepository,
  DiscussionService,
  DiscussionUnitOfWork,
  MentionsRepository,
  PageQuery,
  PostCommentInput,
  PostService,
} from './ports.js';
import { discussionEvents } from './events.js';
import { authorView } from './authors.js';
import { keepAllowed, mentionTokens, mentionViews } from './mentions.js';
import { skipsReview, teamBadge } from './rules.js';
import type { FileUrls } from '../assets/index.js';

/** A course with no stored settings. Discussion is opt-in, so the common case
 *  persists no row at all and every existing course stays silent. */
export const DEFAULT_SETTINGS = {
  enabled: false,
  threaded: true,
  requireReview: false,
  reactions: true,
} as const satisfies CommentSettings;

const EMPTY_REACTIONS: CommentReactions = { reactions: {} };

type Where =
  | { kind: 'course'; courseId: string; activity: Activity }
  | { kind: 'post'; communityId: string; post: Post; space: SpaceDetail };

export type DiscussionServiceParams = {
  repo: DiscussionRepository;
  access: ContentAccessReader;
  content: ActivityGetter;
  posts: Pick<PostService, 'visible' | 'find'>;
  spaces: Pick<CommunityAccess, 'spaceOpenersAmong'>;
  authors: AuthorPermissionReader;
  mentions: MentionsRepository;
  uow: DiscussionUnitOfWork;
  settings: SettingsService;
  fileUrls: FileUrls;
  logger?: Logger;
};

export class DiscussionServiceImpl implements DiscussionService {
  private readonly repo: DiscussionRepository;
  private readonly access: ContentAccessReader;
  private readonly content: ActivityGetter;
  private readonly posts: Pick<PostService, 'visible' | 'find'>;
  private readonly spaces: Pick<CommunityAccess, 'spaceOpenersAmong'>;
  private readonly authors: AuthorPermissionReader;
  private readonly mentions: MentionsRepository;
  private readonly uow: DiscussionUnitOfWork;
  private readonly settings: SettingsService;
  private readonly fileUrls: FileUrls;
  private readonly logger: Logger;

  constructor(params: DiscussionServiceParams) {
    this.repo = params.repo;
    this.access = params.access;
    this.content = params.content;
    this.posts = params.posts;
    this.spaces = params.spaces;
    this.authors = params.authors;
    this.mentions = params.mentions;
    this.uow = params.uow;
    this.settings = params.settings;
    this.fileUrls = params.fileUrls;
    this.logger = params.logger ?? noopLogger;
  }

  private async configOf(orgId: string, activity: Activity): Promise<CommentsConfig> {
    // The `content` namespace row is the whole CourseSettings, owned and written
    // by content; this context only reads its `comments` key.
    const stored = await this.settings.get<Partial<CourseSettings>>(
      orgId,
      SettingsNamespace.content,
      activity.courseId,
    );
    const settings = { ...DEFAULT_SETTINGS, ...stored?.comments };
    // Comments off for the course cannot be overridden back on by an activity:
    // the course switch is the master.
    const rule = ((activity.settings ?? {}) as ActivitySettings).comments ?? 'inherit';
    return {
      enabled: settings.enabled && rule !== 'never',
      threaded: settings.threaded,
      requireReview: settings.requireReview,
      reactions: settings.reactions,
    };
  }

  private async badgesOf(
    orgId: string,
    orgUserIds: string[],
  ): Promise<Map<string, EffectivePermissions>> {
    return this.authors.permissionsOfMany(orgId, [...new Set(orgUserIds)]);
  }

  private toView(
    orgId: string,
    comment: Comment,
    itemId: string,
    authors: Record<string, AuthorRecord>,
    permissions: Map<string, EffectivePermissions>,
    reactions: CommentReactions,
    mentions: MentionView[],
  ): CommentView {
    const author = authors[comment.orgUserId];
    if (!author) {
      throw new NotFoundError('Member', comment.orgUserId);
    }
    if (comment.removedBy && !authors[comment.removedBy]) {
      throw new NotFoundError('Member', comment.removedBy);
    }
    const remover = comment.removedBy ? authors[comment.removedBy] : undefined;
    return {
      id: comment.id,
      activityId: comment.activityId,
      postId: comment.postId,
      communityId: comment.communityId,
      parentId: comment.parentId,
      author: authorView(
        orgId,
        author,
        this.fileUrls,
        teamBadge(permissions.get(author.id), itemId),
      ),
      body: comment.status === 'removed' ? null : comment.body,
      status: comment.status,
      removedBy: remover
        ? authorView(orgId, remover, this.fileUrls, teamBadge(permissions.get(remover.id), itemId))
        : null,
      reactions: reactions.reactions,
      viewerReaction: reactions.viewerReaction,
      mentions: comment.status === 'removed' ? [] : mentions,
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
    };
  }

  private peopleIn(comments: Comment[]): string[] {
    const ids = new Set<string>();
    for (const c of comments) {
      ids.add(c.orgUserId);
      if (c.removedBy) {
        ids.add(c.removedBy);
      }
    }
    return [...ids];
  }

  private itemOf(where: Where): string {
    return where.kind === 'course' ? where.courseId : where.communityId;
  }

  private async renderOne(comment: Comment, where: Where, actor: Actor): Promise<CommentView> {
    const orgId = actor.orgId;
    const people = this.peopleIn([comment]);
    const [authors, permissions, mentioned] = await Promise.all([
      this.repo.authorsOf(orgId, people),
      this.badgesOf(orgId, people),
      mentionViews(this.mentions, this.repo, orgId, 'comment', [comment.id]),
    ]);
    const stored =
      comment.status === 'removed'
        ? EMPTY_REACTIONS
        : ((await this.repo.reactionsOf(orgId, [comment.id], actor.id))[comment.id] ??
          EMPTY_REACTIONS);
    return this.toView(
      orgId,
      comment,
      this.itemOf(where),
      authors,
      permissions,
      stored,
      mentioned[comment.id] ?? [],
    );
  }

  private activityIdOf(comment: Comment): string {
    if (comment.activityId === null) {
      throw new NotFoundError('Activity', comment.id);
    }
    return comment.activityId;
  }

  private system(orgId: string): Actor {
    return this.authors.systemActor(orgId);
  }

  private async activityOf(orgId: string, activityId: string): Promise<Activity | null> {
    return this.content.getActivity(activityId, this.system(orgId));
  }

  private async opensCourse(actor: Actor, courseId: string): Promise<boolean> {
    return (
      actor.permissions.has('courses:read', courseId) ||
      this.access.hasAccess(actor.orgId, actor.id, courseId)
    );
  }

  private async requireActivityOpen(activityId: string, actor: Actor): Promise<Activity> {
    const activity = await this.activityOf(actor.orgId, activityId);
    if (!activity) {
      throw new NotFoundError('Activity', activityId);
    }
    if (!(await this.opensCourse(actor, activity.courseId))) {
      this.logger.warn('activity refused — no access', {
        orgId: actor.orgId,
        activityId,
        actorId: actor.id,
      });
      throw new ForbiddenError('You cannot open this activity');
    }
    return activity;
  }

  private async courseOpeners(
    orgId: string,
    courseId: string,
    orgUserIds: string[],
  ): Promise<string[]> {
    if (orgUserIds.length === 0) {
      return [];
    }
    const [people, permissions] = await Promise.all([
      this.repo.authorsOf(orgId, orgUserIds),
      this.badgesOf(orgId, orgUserIds),
    ]);
    const opens = await Promise.all(
      orgUserIds.map(async (orgUserId) => {
        if (!people[orgUserId]) {
          return false;
        }
        return (
          (permissions.get(orgUserId)?.has('courses:read', courseId) ?? false) ||
          this.access.hasAccess(orgId, orgUserId, courseId)
        );
      }),
    );
    return orgUserIds.filter((_, index) => opens[index]);
  }

  private async spaceOpeners(orgId: string, spaceId: string, orgUserIds: string[]) {
    if (orgUserIds.length === 0) {
      return [];
    }
    return keepAllowed(orgUserIds, await this.spaces.spaceOpenersAmong(orgId, spaceId, orgUserIds));
  }

  private async openersOf(orgId: string, comment: Comment, orgUserIds: string[]) {
    if (orgUserIds.length === 0) {
      return [];
    }
    if (comment.postId) {
      const post = await this.posts.find(orgId, comment.postId);
      return post ? this.spaceOpeners(orgId, post.spaceId, orgUserIds) : [];
    }
    const activity = await this.activityOf(orgId, this.activityIdOf(comment));
    return activity ? this.courseOpeners(orgId, activity.courseId, orgUserIds) : [];
  }

  commenterIds(
    orgId: string,
    target: { postId: string } | { activityId: string },
  ): Promise<string[]> {
    return this.repo.commenterIds(orgId, target);
  }

  async postComment(input: PostCommentInput, actor: Actor): Promise<CommentView> {
    if (input.postId) {
      return this.postOnPost(input.postId, input, actor);
    }
    const activityId = input.activityId;
    if (!activityId) {
      throw new NotFoundError('Activity', activityId ?? '');
    }
    return this.postOnActivity(activityId, input, actor);
  }

  async replyToComment(commentId: string, body: string, actor: Actor): Promise<CommentView> {
    const parent = await this.getComment(actor.orgId, commentId);
    if (!parent || parent.activityId === null) {
      throw new NotFoundError('Comment', commentId);
    }
    const activity = await this.activityOf(actor.orgId, parent.activityId);
    if (!activity) {
      throw new NotFoundError('Comment', commentId);
    }
    this.requireModerates(actor, { kind: 'course', courseId: activity.courseId, activity });
    return this.postOnActivity(
      parent.activityId,
      { activityId: parent.activityId, parentId: parent.parentId ?? parent.id, body },
      actor,
    );
  }

  private async postOnActivity(
    activityId: string,
    { parentId, body }: PostCommentInput,
    actor: Actor,
  ): Promise<CommentView> {
    const orgId = actor.orgId;
    const activity = await this.requireActivityOpen(activityId, actor);
    const config = await this.configOf(orgId, activity);

    if (!config.enabled) {
      throw new ForbiddenError('Discussion is not open on this activity');
    }

    if (parentId !== null) {
      if (!config.threaded) {
        throw new ForbiddenError('Replies are off on this course');
      }
      const parent = await this.repo.findComment(orgId, parentId);
      if (!parent || parent.activityId !== activityId) {
        throw new NotFoundError('Comment', parentId);
      }

      if (parent.parentId !== null) {
        throw new ForbiddenError('A reply cannot have replies of its own');
      }

      if (parent.status !== 'published') {
        throw new ForbiddenError('You can reply only to a published comment');
      }
    }

    const status: Comment['status'] =
      config.requireReview && !skipsReview(actor.permissions, { courseId: activity.courseId })
        ? 'pending'
        : 'published';

    const comment: Comment = {
      id: genId('comment'),
      orgId,
      activityId,
      postId: null,
      communityId: null,
      parentId,
      orgUserId: actor.id,
      body,
      status,
      removedBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const mentioned = await this.courseOpeners(orgId, activity.courseId, mentionTokens(body));
    const saved = await this.uow.run(async (scope) => {
      const row = await scope.discussion.insertComment(orgId, comment);
      await scope.mentions.sync(orgId, 'comment', row.id, mentioned, comment.createdAt);
      await scope.outbox.append([
        discussionEvents.commentCreated.make({
          orgId,
          data: { ...row, mentionedOrgUserIds: status === 'published' ? mentioned : [] },
          metadata: { actorOrgUserId: actor.id },
        }),
      ]);
      this.logger.info('comment created', { orgId, commentId: row.id, status, actorId: actor.id });
      return row;
    });
    return this.renderOne(saved, { kind: 'course', courseId: activity.courseId, activity }, actor);
  }

  private async postOnPost(
    postId: string,
    { parentId, body }: PostCommentInput,
    actor: Actor,
  ): Promise<CommentView> {
    const orgId = actor.orgId;
    const { post, space } = await this.posts.visible(postId, actor);
    if (post.status !== 'published') {
      throw new ConflictError('This post is not published');
    }
    if (!this.commentsOpen(post, space)) {
      throw new ForbiddenError('Comments are closed on this post');
    }
    if (parentId !== null) {
      const parent = await this.repo.findComment(orgId, parentId);
      if (!parent || parent.postId !== postId) {
        throw new NotFoundError('Comment', parentId);
      }
      if (parent.parentId !== null) {
        throw new ForbiddenError('A reply cannot have replies of its own');
      }
      if (parent.status !== 'published') {
        throw new ForbiddenError('You can reply only to a published comment');
      }
    }
    const now = new Date();
    const comment: Comment = {
      id: genId('comment'),
      orgId,
      activityId: null,
      postId,
      communityId: post.communityId,
      parentId,
      orgUserId: actor.id,
      body,
      status: 'published',
      removedBy: null,
      createdAt: now,
      updatedAt: now,
    };
    const mentioned = await this.spaceOpeners(orgId, post.spaceId, mentionTokens(body));
    const saved = await this.uow.run(async (scope) => {
      const row = await scope.discussion.insertComment(orgId, comment);
      await scope.mentions.sync(orgId, 'comment', row.id, mentioned, now);
      await scope.outbox.append([
        discussionEvents.commentCreated.make({
          orgId,
          data: { ...row, mentionedOrgUserIds: mentioned },
          metadata: { actorOrgUserId: actor.id },
        }),
      ]);
      this.logger.info('comment created', {
        orgId,
        commentId: row.id,
        postId,
        status: 'published',
        actorId: actor.id,
      });
      return row;
    });
    return this.renderOne(
      saved,
      { kind: 'post', communityId: post.communityId, post, space },
      actor,
    );
  }

  async postComments(postId: string, query: PageQuery, actor: Actor): Promise<Page<CommentView>> {
    const orgId = actor.orgId;
    const { post, space } = await this.posts.visible(postId, actor);
    const seesHeld = actor.permissions.has('communities:moderate', post.communityId);
    const page = await this.repo.listThreadsByPost(orgId, postId, {
      ...query,
      viewerId: actor.id,
      seesHeld,
    });
    const comments = await this.thread(
      orgId,
      page.rows,
      actor,
      post.communityId,
      post.reactionsEnabled ?? space.settings.reactions,
      seesHeld,
    );
    this.logger.debug('post comments read', { orgId, postId, count: comments.length });
    return { ...page, rows: comments };
  }

  private async thread(
    orgId: string,
    rows: Comment[],
    actor: Actor,
    itemId: string,
    reactionsOn: boolean,
    seesHeld: boolean,
  ): Promise<CommentView[]> {
    const readable = rows.filter((comment) => {
      if (comment.status === 'published' || comment.status === 'removed') {
        return true;
      }
      return seesHeld || comment.orgUserId === actor.id;
    });
    const replies = readable.filter(
      (comment) => comment.parentId !== null && comment.status !== 'removed',
    );
    const heldOpen = new Set(replies.map((reply) => reply.parentId));
    const roots = readable.filter(
      (comment) =>
        comment.parentId === null && (comment.status !== 'removed' || heldOpen.has(comment.id)),
    );
    const rootIds = new Set(roots.map((root) => root.id));
    const served = [...roots, ...replies.filter((reply) => rootIds.has(reply.parentId!))].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    );
    const people = this.peopleIn(served);
    const [authors, permissions, reactions, mentioned] = await Promise.all([
      this.repo.authorsOf(orgId, people),
      this.badgesOf(orgId, people),
      reactionsOn
        ? this.repo.reactionsOf(
            orgId,
            served.map((comment) => comment.id),
            actor.id,
          )
        : Promise.resolve<Record<string, CommentReactions>>({}),
      mentionViews(
        this.mentions,
        this.repo,
        orgId,
        'comment',
        served.map((comment) => comment.id),
      ),
    ]);
    return served.map((comment) =>
      this.toView(
        orgId,
        comment,
        itemId,
        authors,
        permissions,
        reactions[comment.id] ?? EMPTY_REACTIONS,
        mentioned[comment.id] ?? [],
      ),
    );
  }

  private async postOfComment(
    actor: Actor,
    commentId: string,
    postId: string,
  ): Promise<{ post: Post; space: SpaceDetail }> {
    try {
      return await this.posts.visible(postId, actor);
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw new NotFoundError('Comment', commentId);
      }
      throw error;
    }
  }

  private isWithin(comment: Comment, within: CommentWithin): boolean {
    if (within === 'any') {
      return true;
    }
    if (within === 'lesson') {
      return comment.activityId !== null;
    }
    return comment.communityId === within.communityId;
  }

  private commentsOpen(post: Post, space: SpaceDetail): boolean {
    return post.commentsClosed === null ? space.settings.comments : !post.commentsClosed;
  }

  /** Where the comment sits, having proved the actor may reach it: the post
   *  is visible to them, or they open the course. */
  private async whereOf(comment: Comment, actor: Actor): Promise<Where> {
    if (comment.postId) {
      const { post, space } = await this.postOfComment(actor, comment.id, comment.postId);
      return { kind: 'post', communityId: post.communityId, post, space };
    }
    const activity = await this.activityOf(actor.orgId, this.activityIdOf(comment));
    if (!activity) {
      throw new NotFoundError('Comment', comment.id);
    }
    if (!(await this.opensCourse(actor, activity.courseId))) {
      this.logger.warn('comment refused — no access', {
        orgId: actor.orgId,
        commentId: comment.id,
        actorId: actor.id,
      });
      throw new ForbiddenError('You cannot open this activity');
    }
    return { kind: 'course', courseId: activity.courseId, activity };
  }

  private moderates(actor: Actor, where: Where): boolean {
    return where.kind === 'course'
      ? actor.permissions.has('courses:moderate', where.courseId)
      : actor.permissions.has('communities:moderate', where.communityId);
  }

  private requireModerates(actor: Actor, where: Where): void {
    actor.permissions.require(
      where.kind === 'course' ? 'courses:moderate' : 'communities:moderate',
      this.itemOf(where),
    );
  }

  private async findIn(
    commentId: string,
    within: CommentWithin,
    actor: Actor,
    action: string,
  ): Promise<Comment> {
    const comment = await this.getComment(actor.orgId, commentId);
    if (!comment || !this.isWithin(comment, within)) {
      this.logger.warn(`comment ${action} rejected — not found`, {
        orgId: actor.orgId,
        commentId,
        actorId: actor.id,
      });
      throw new NotFoundError('Comment', commentId);
    }
    return comment;
  }

  async activityComments(activityId: string, actor: Actor): Promise<ActivityComments> {
    const activity = await this.requireActivityOpen(activityId, actor);
    const config = await this.configOf(actor.orgId, activity);
    if (!config.enabled) {
      return { config, comments: [] };
    }
    const rows = await this.repo.listByActivity(actor.orgId, activityId);
    return {
      config,
      comments: await this.thread(
        actor.orgId,
        rows,
        actor,
        activity.courseId,
        config.reactions,
        actor.permissions.has('courses:moderate', activity.courseId),
      ),
    };
  }

  async edit(commentId: string, body: string, actor: Actor): Promise<CommentView> {
    const orgId = actor.orgId;
    const { comment, config, where } = await this.loadWithConfig(commentId, actor);
    if (!config.enabled) {
      throw new ForbiddenError(
        comment.postId
          ? 'Comments are closed on this post'
          : 'Discussion is not open on this activity',
      );
    }
    // Editing is the author's alone — moderators remove, they do not rewrite.
    if (comment.orgUserId !== actor.id) {
      throw new ForbiddenError('You can edit only your own comment');
    }
    if (comment.status === 'removed') {
      throw new ForbiddenError('A removed comment cannot be edited');
    }
    const candidates = await this.openersOf(orgId, comment, mentionTokens(body));
    const updated = await this.uow.run(async (scope) => {
      const next = await scope.discussion.updateComment(orgId, commentId, {
        body,
      });
      if (!next) {
        // getComment() proved it existed; a null here means it vanished mid-write.
        // Returning the pre-edit comment would report success and hand back
        // the old body.
        throw new NotFoundError('Comment', commentId);
      }
      const added = await scope.mentions.sync(orgId, 'comment', commentId, candidates, new Date());
      await scope.outbox.append([
        discussionEvents.commentUpdated.make({
          orgId,
          data: {
            ...next,
            mentionedOrgUserIds: next.status === 'published' ? keepAllowed(candidates, added) : [],
          },
          metadata: { actorOrgUserId: actor.id },
        }),
      ]);
      return next;
    });
    this.logger.info('comment edited', { orgId, commentId, actorId: actor.id });
    return this.renderOne(updated, where, actor);
  }

  async remove(commentId: string, within: CommentWithin, actor: Actor): Promise<CommentView> {
    const orgId = actor.orgId;
    const comment = await this.findIn(commentId, within, actor, 'remove');
    const where = await this.whereOf(comment, actor);
    if (comment.orgUserId !== actor.id && !this.moderates(actor, where)) {
      this.logger.warn('comment remove refused — not the author or a moderator', {
        orgId,
        commentId,
        actorId: actor.id,
      });
      throw new ForbiddenError('You cannot remove this comment');
    }

    if (comment.status === 'removed') {
      return this.renderOne(comment, where, actor);
    }

    const removed = await this.uow.run(async (scope) => {
      const updated = await scope.discussion.updateComment(orgId, commentId, {
        status: 'removed',
        removedBy: actor.id,
      });
      if (!updated) {
        // getComment() proved it existed; a null here means it vanished mid-operation.
        // Roll back rather than emit an event for a transition that didn't happen.
        throw new NotFoundError('Comment', commentId);
      }
      if (comment.orgUserId !== actor.id) {
        await scope.discussion.resolveReportsFor(orgId, commentId, {
          resolvedAt: new Date(),
          resolvedBy: actor.id,
          resolution: 'removed',
        });
      }
      await scope.outbox.append([
        discussionEvents.commentRemoved.make({
          orgId,
          data: updated,
          metadata: { actorOrgUserId: actor.id },
        }),
      ]);
      this.logger.info('comment removed', { orgId, commentId, actorId: actor.id });
      return updated;
    });
    return this.renderOne(removed, where, actor);
  }

  async restore(commentId: string, within: CommentWithin, actor: Actor): Promise<CommentView> {
    const comment = await this.findIn(commentId, within, actor, 'restore');
    const where = await this.whereOf(comment, actor);
    this.requireModerates(actor, where);
    return this.renderOne(await this.restoreComment(comment, actor), where, actor);
  }

  private async restoreComment(comment: Comment, actor: Actor): Promise<Comment> {
    if (comment.status !== 'removed') {
      return comment;
    }
    const updated = await this.repo.updateComment(actor.orgId, comment.id, {
      status: 'published',
      removedBy: null,
    });
    if (!updated) {
      // getComment() proved it existed; a null here means it vanished mid-write.
      // Returning the still-removed comment would report success while
      // handing back the removed row.
      throw new NotFoundError('Comment', comment.id);
    }
    this.logger.info('comment restored', {
      orgId: actor.orgId,
      commentId: comment.id,
      actorId: actor.id,
    });
    return updated;
  }

  /** Load a comment together with where it sits and the comments config that
   *  applies there, having proved the actor may reach it at all. Every path
   *  that acts on one comment needs them, and none should read the row twice. */
  private async loadWithConfig(
    commentId: string,
    actor: Actor,
  ): Promise<{ comment: Comment; config: CommentsConfig; where: Where }> {
    const comment = await this.getComment(actor.orgId, commentId);
    if (!comment) {
      throw new NotFoundError('Comment', commentId);
    }
    const where = await this.whereOf(comment, actor);
    if (where.kind === 'post') {
      const config: CommentsConfig = {
        enabled: this.commentsOpen(where.post, where.space),
        threaded: true,
        requireReview: false,
        reactions: where.post.reactionsEnabled ?? where.space.settings.reactions,
      };
      return { comment, config, where };
    }
    return { comment, config: await this.configOf(actor.orgId, where.activity), where };
  }

  async setReaction(
    commentId: string,
    emoji: ReactionEmoji | null,
    actor: Actor,
  ): Promise<CommentReactions> {
    const orgId = actor.orgId;
    const { comment, config, where } = await this.loadWithConfig(commentId, actor);
    if (!config.enabled && !comment.postId) {
      throw new ForbiddenError('Discussion is not open on this activity');
    }
    if (!config.reactions && emoji !== null) {
      throw new ForbiddenError(
        comment.postId ? 'Reactions are off on this post' : 'Reactions are off on this course',
      );
    }
    if (comment.status === 'removed') {
      throw new ForbiddenError('A removed comment cannot be reacted to');
    }
    await this.uow.run(async (scope) => {
      const first = await scope.discussion.setReaction(orgId, commentId, actor.id, emoji);
      if (!first || emoji === null) {
        return;
      }
      await scope.outbox.append([
        discussionEvents.commentReactionAdded.make({
          orgId,
          data: {
            commentId,
            postId: comment.postId,
            activityId: comment.activityId,
            spaceId: where.kind === 'post' ? where.post.spaceId : null,
            communityId: comment.communityId,
            orgUserId: actor.id,
            reaction: emoji,
          },
          metadata: { actorOrgUserId: actor.id },
        }),
      ]);
    });
    const stored = await this.repo.reactionsOf(orgId, [commentId], actor.id);
    return stored[commentId] ?? EMPTY_REACTIONS;
  }

  async approve(commentId: string, actor: Actor): Promise<Comment> {
    const comment = await this.findIn(commentId, 'any', actor, 'approve');
    const where = await this.whereOf(comment, actor);
    this.requireModerates(actor, where);
    return this.approveComment(comment, actor);
  }

  private async approveComment(comment: Comment, actor: Actor): Promise<Comment> {
    const orgId = actor.orgId;
    const commentId = comment.id;
    if (comment.status !== 'pending') {
      throw new ForbiddenError('Only a comment awaiting review can be approved');
    }
    return this.uow.run(async (scope) => {
      const updated = await scope.discussion.updateComment(orgId, commentId, {
        status: 'published',
      });
      if (!updated) {
        // getComment() proved it existed; a null here means it vanished mid-operation.
        // Roll back rather than emit an event for a transition that didn't happen.
        throw new NotFoundError('Comment', commentId);
      }
      const mentioned = await this.openersOf(
        orgId,
        updated,
        await scope.mentions.ofItem(orgId, 'comment', commentId),
      );
      await scope.outbox.append([
        discussionEvents.commentPublished.make({
          orgId,
          data: { ...updated, mentionedOrgUserIds: mentioned },
          metadata: { actorOrgUserId: actor.id },
        }),
      ]);
      this.logger.info('comment published', { orgId, commentId, actorId: actor.id });
      return updated;
    });
  }

  /** Loads the comment and dispatches to whichever transition applies — the
   *  caller must not decide that itself. */
  async publish(commentId: string, within: CommentWithin, actor: Actor): Promise<Comment> {
    const comment = await this.findIn(commentId, within, actor, 'publish');
    const where = await this.whereOf(comment, actor);
    this.requireModerates(actor, where);
    if (comment.status === 'pending') {
      return this.approveComment(comment, actor);
    }
    if (comment.status === 'removed') {
      return this.restoreComment(comment, actor);
    }
    return comment;
  }

  async resolveReports(commentId: string, within: CommentWithin, actor: Actor): Promise<void> {
    const comment = await this.findIn(commentId, within, actor, 'reports resolve');
    const where = await this.whereOf(comment, actor);
    this.requireModerates(actor, where);
    await this.repo.resolveReportsFor(actor.orgId, commentId, {
      resolvedAt: new Date(),
      resolvedBy: actor.id,
      resolution: 'dismissed',
    });
    this.logger.info('comment reports resolved', {
      orgId: actor.orgId,
      commentId,
      actorId: actor.id,
    });
  }

  async reportComment(commentId: string, reason: string, actor: Actor): Promise<CommentReport> {
    const orgId = actor.orgId;
    const { comment, config } = await this.loadWithConfig(commentId, actor);
    // Locked accepts reports — a locked activity can still hold something a
    // moderator needs to see. Hidden does not: nothing in it is being served,
    // so nobody is looking at a comment to flag.
    if (!config.enabled && !comment.postId) {
      throw new ForbiddenError('Discussion is not open on this activity');
    }
    const now = new Date();
    const report: CommentReport = {
      id: genId('commentReport'),
      orgId,
      commentId,
      orgUserId: actor.id,
      reason,
      resolvedAt: null,
      resolution: null,
      resolvedBy: null,
      createdAt: now,
      updatedAt: now,
    };
    return this.uow.run(async (scope) => {
      const saved = await scope.discussion.insertReport(orgId, report);
      if (!saved) {
        // Already reported by this person. Return the report that actually
        // exists — a fabricated id resolves to nothing — and emit no second
        // event, which would double-count any threshold automation.
        const open = await scope.discussion.listOpenReports(orgId, [commentId]);
        const mine = open.find((r) => r.orgUserId === actor.id);
        if (mine) {
          return mine;
        }
        return report;
      }
      await scope.outbox.append([
        discussionEvents.commentReported.make({
          orgId,
          data: { ...saved, communityId: comment.communityId },
          metadata: { actorOrgUserId: actor.id },
        }),
      ]);
      this.logger.info('comment reported', { orgId, commentId, actorId: actor.id });
      return saved;
    });
  }

  async listComments(query: ListCommentsQuery, actor: Actor): Promise<Page<CommentListItem>> {
    const orgId = actor.orgId;
    const where = actor.permissions.where('courses:moderate');
    if (!where.org && where.content.length === 0) {
      this.logger.warn('comment list refused — moderates no course', { orgId, actorId: actor.id });
      throw new ForbiddenError('You need courses:moderate');
    }
    const page = await this.repo.listComments(orgId, query, where.org ? undefined : where.content);
    const rows = page.rows.map((r) => r.comment);
    if (rows.length === 0) {
      return { ...page, rows: [] };
    }
    const reports = await this.repo.listOpenReports(
      orgId,
      rows.map((c) => c.id),
    );
    const people = [...new Set([...this.peopleIn(rows), ...reports.map((r) => r.orgUserId)])];
    const [authors, permissions] = await Promise.all([
      this.repo.authorsOf(orgId, people),
      this.badgesOf(orgId, people),
    ]);
    const urls = this.fileUrls;

    const byComment = new Map<string, CommentReport[]>();
    for (const report of reports) {
      byComment.set(report.commentId, [...(byComment.get(report.commentId) ?? []), report]);
    }

    return {
      ...page,
      rows: page.rows.map(({ comment, courseId, activityTitle }) => {
        const author = authors[comment.orgUserId];
        if (!author) {
          throw new NotFoundError('Member', comment.orgUserId);
        }
        return {
          id: comment.id,
          parentId: comment.parentId,
          activityId: this.activityIdOf(comment),
          activityTitle,
          courseId,
          body: comment.body,
          status: comment.status,
          author: authorView(orgId, author, urls, teamBadge(permissions.get(author.id), courseId)),
          authorEmail: author.email,
          removedBy: comment.removedBy,
          reports: (byComment.get(comment.id) ?? []).map((r) => {
            const reporter = authors[r.orgUserId];
            if (!reporter) {
              throw new NotFoundError('Member', r.orgUserId);
            }
            return {
              reporter: authorView(
                orgId,
                reporter,
                urls,
                teamBadge(permissions.get(reporter.id), courseId),
              ),
              reason: r.reason,
              createdAt: r.createdAt,
            };
          }),
          createdAt: comment.createdAt,
          updatedAt: comment.updatedAt,
        };
      }),
    };
  }

  getComment(orgId: string, commentId: string): Promise<Comment | null> {
    return this.repo.findComment(orgId, commentId);
  }
}
