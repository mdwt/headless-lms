import { genId } from '../shared/id.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../shared/errors.js';
import { canModerate, isStaffRole } from '../organizations/index.js';
import type { Logger } from '../shared/ports.js';
import { noopLogger } from '../shared/logger.js';
import type { Comment, CommentReport, CommentSettings } from './model.js';
import type { ActivitySettings, CourseSettings, Post, SpaceDetail } from '../types/index.js';
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
  AuthorRecord,
  CommentReactions,
  ContentAccessReader,
  DiscussionRepository,
  DiscussionService,
  DiscussionUnitOfWork,
  PageQuery,
  PostCommentInput,
  PostService,
} from './ports.js';
import { discussionEvents } from './events.js';
import { authorView } from './authors.js';
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

export type DiscussionServiceParams = {
  repo: DiscussionRepository;
  access: ContentAccessReader;
  content: ActivityGetter;
  posts: Pick<PostService, 'visible'>;
  uow: DiscussionUnitOfWork;
  settings: SettingsService;
  communities: { listIds(orgId: string): Promise<string[]> };
  fileUrls: FileUrls;
  logger?: Logger;
};

export class DiscussionServiceImpl implements DiscussionService {
  private readonly repo: DiscussionRepository;
  private readonly access: ContentAccessReader;
  private readonly content: ActivityGetter;
  private readonly posts: Pick<PostService, 'visible'>;
  private readonly uow: DiscussionUnitOfWork;
  private readonly settings: SettingsService;
  private readonly communities: { listIds(orgId: string): Promise<string[]> };
  private readonly fileUrls: FileUrls;
  private readonly logger: Logger;

  constructor(params: DiscussionServiceParams) {
    this.repo = params.repo;
    this.access = params.access;
    this.content = params.content;
    this.posts = params.posts;
    this.uow = params.uow;
    this.settings = params.settings;
    this.communities = params.communities;
    this.fileUrls = params.fileUrls;
    this.logger = params.logger ?? noopLogger;
  }

  async resolveConfig(orgId: string, activityId: string): Promise<CommentsConfig> {
    const activity = await this.content.getActivity(orgId, activityId);
    if (!activity) {
      throw new NotFoundError('Activity', activityId);
    }

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
    const rule = ((activity?.settings ?? {}) as ActivitySettings).comments ?? 'inherit';
    return {
      enabled: settings.enabled && rule !== 'never',
      threaded: settings.threaded,
      requireReview: settings.requireReview,
      reactions: settings.reactions,
    };
  }

  private isStaff(actor: Actor): boolean {
    return isStaffRole(actor.role);
  }

  private toView(
    orgId: string,
    comment: Comment,
    authors: Record<string, AuthorRecord>,
    urls: FileUrls,
    reactions: CommentReactions,
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
      author: authorView(orgId, author, urls),
      body: comment.status === 'removed' ? null : comment.body,
      status: comment.status,
      removedBy: remover ? authorView(orgId, remover, urls) : null,
      reactions: reactions.reactions,
      viewerReaction: reactions.viewerReaction,
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

  private async renderOne(orgId: string, comment: Comment, actor: Actor): Promise<CommentView> {
    const authors = await this.repo.authorsOf(orgId, this.peopleIn([comment]));
    const stored =
      comment.status === 'removed'
        ? EMPTY_REACTIONS
        : ((await this.repo.reactionsOf(orgId, [comment.id], actor.id))[comment.id] ??
          EMPTY_REACTIONS);
    return this.toView(orgId, comment, authors, this.fileUrls, stored);
  }

  private activityIdOf(comment: Comment): string {
    if (comment.activityId === null) {
      throw new NotFoundError('Activity', comment.id);
    }
    return comment.activityId;
  }

  private async hasAccess(orgId: string, activityId: string, actor: Actor): Promise<boolean> {
    if (this.isStaff(actor)) {
      return true;
    }
    const activity = await this.content.getActivity(orgId, activityId);
    return activity ? this.access.hasAccess(orgId, actor.id, activity.courseId) : false;
  }

  private async requireActivityOpen(
    orgId: string,
    activityId: string,
    actor: Actor,
  ): Promise<void> {
    const activity = await this.content.getActivity(orgId, activityId);
    if (!activity) {
      throw new NotFoundError('Activity', activityId);
    }
    if (
      !this.isStaff(actor) &&
      !(await this.access.hasAccess(orgId, actor.id, activity.courseId))
    ) {
      throw new ForbiddenError('You cannot open this activity');
    }
  }

  async postComment(orgId: string, input: PostCommentInput): Promise<CommentView> {
    if (input.postId) {
      return this.postOnPost(orgId, input.postId, input);
    }
    const activityId = input.activityId;
    if (!activityId) {
      throw new NotFoundError('Activity', activityId ?? '');
    }
    return this.postOnActivity(orgId, activityId, input);
  }

  private async postOnActivity(
    orgId: string,
    activityId: string,
    { actor, parentId, body }: PostCommentInput,
  ): Promise<CommentView> {
    await this.requireActivityOpen(orgId, activityId, actor);
    const config = await this.resolveConfig(orgId, activityId);

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
      config.requireReview && !this.isStaff(actor) ? 'pending' : 'published';

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
    const saved = await this.uow.run(async (scope) => {
      const row = await scope.discussion.insertComment(orgId, comment);
      await scope.outbox.append([discussionEvents.commentCreated.make({ orgId, data: row })]);
      this.logger.info('comment created', { orgId, commentId: row.id, status, actorId: actor.id });
      return row;
    });
    return this.renderOne(orgId, saved, actor);
  }

  private async postOnPost(
    orgId: string,
    postId: string,
    { actor, parentId, body }: PostCommentInput,
  ): Promise<CommentView> {
    const { post, space } = await this.visiblePost(orgId, actor, postId);
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
    const saved = await this.uow.run(async (scope) => {
      const row = await scope.discussion.insertComment(orgId, comment);
      await scope.outbox.append([
        discussionEvents.commentCreated.make({
          orgId,
          data: row,
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
    return this.renderOne(orgId, saved, actor);
  }

  async postComments(
    orgId: string,
    postId: string,
    actor: Actor,
    query: PageQuery,
  ): Promise<Page<CommentView>> {
    const { post, space } = await this.visiblePost(orgId, actor, postId);
    const seesHeld = (person: Actor) => this.canModerate(person);
    const page = await this.repo.listThreadsByPost(orgId, postId, {
      ...query,
      viewerId: actor.id,
      seesHeld: seesHeld(actor),
    });
    const comments = await this.thread(
      orgId,
      page.rows,
      actor,
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
    reactionsOn: boolean,
    seesHeld: (actor: Actor) => boolean,
  ): Promise<CommentView[]> {
    const readable = rows.filter((comment) => {
      if (comment.status === 'published' || comment.status === 'removed') {
        return true;
      }
      return seesHeld(actor) || comment.orgUserId === actor.id;
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
    const [authors, reactions] = await Promise.all([
      this.repo.authorsOf(orgId, this.peopleIn(served)),
      reactionsOn
        ? this.repo.reactionsOf(
            orgId,
            served.map((comment) => comment.id),
            actor.id,
          )
        : Promise.resolve<Record<string, CommentReactions>>({}),
    ]);
    const urls = this.fileUrls;
    return served.map((comment) =>
      this.toView(orgId, comment, authors, urls, reactions[comment.id] ?? EMPTY_REACTIONS),
    );
  }

  private async visiblePost(
    orgId: string,
    actor: Actor,
    postId: string,
  ): Promise<{ post: Post; space: SpaceDetail }> {
    return this.posts.visible(orgId, actor, postId);
  }

  private async postOfComment(
    orgId: string,
    actor: Actor,
    commentId: string,
    postId: string,
  ): Promise<{ post: Post; space: SpaceDetail }> {
    try {
      return await this.visiblePost(orgId, actor, postId);
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw new NotFoundError('Comment', commentId);
      }
      throw error;
    }
  }

  private canModerate(actor: Actor): boolean {
    return canModerate(actor.role);
  }

  private inCommunity(comment: Comment, communityId: string | undefined): boolean {
    return communityId === undefined || comment.communityId === communityId;
  }

  private commentsOpen(post: Post, space: SpaceDetail): boolean {
    return post.commentsClosed === null ? space.settings.comments : !post.commentsClosed;
  }

  async activityComments(
    orgId: string,
    activityId: string,
    actor: Actor,
  ): Promise<ActivityComments> {
    await this.requireActivityOpen(orgId, activityId, actor);
    const config = await this.resolveConfig(orgId, activityId);
    if (!config.enabled) {
      return { config, comments: [] };
    }
    const rows = await this.repo.listByActivity(orgId, activityId);
    return {
      config,
      comments: await this.thread(orgId, rows, actor, config.reactions, (person) =>
        this.isStaff(person),
      ),
    };
  }

  async edit(orgId: string, commentId: string, actor: Actor, body: string): Promise<CommentView> {
    const { comment, config } = await this.loadWithConfig(orgId, commentId, actor);
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
    const updated = await this.repo.updateComment(orgId, commentId, {
      body,
    });
    if (!updated) {
      // getComment() proved it existed; a null here means it vanished mid-write.
      // Returning the pre-edit comment would report success and hand back
      // the old body.
      throw new NotFoundError('Comment', commentId);
    }
    return this.renderOne(orgId, updated, actor);
  }

  async remove(
    orgId: string,
    commentId: string,
    actor: Actor,
    communityId?: string,
  ): Promise<CommentView> {
    return this.renderOne(
      orgId,
      await this.removeComment(orgId, commentId, actor, communityId),
      actor,
    );
  }

  private async removeComment(
    orgId: string,
    commentId: string,
    actor: Actor,
    communityId?: string,
  ): Promise<Comment> {
    const comment = await this.getComment(orgId, commentId);
    if (!comment || !this.inCommunity(comment, communityId)) {
      this.logger.warn('comment remove rejected — not found', {
        orgId,
        commentId,
        actorId: actor.id,
      });
      throw new NotFoundError('Comment', commentId);
    }

    if (comment.postId) {
      await this.postOfComment(orgId, actor, commentId, comment.postId);
      if (comment.orgUserId !== actor.id && !this.canModerate(actor)) {
        throw new ForbiddenError('You cannot remove this comment');
      }
    } else {
      if (!(await this.hasAccess(orgId, this.activityIdOf(comment), actor))) {
        throw new ForbiddenError('You cannot open this activity');
      }
      if (comment.orgUserId !== actor.id && !this.isStaff(actor)) {
        throw new ForbiddenError('You cannot remove this comment');
      }
    }

    if (comment.status === 'removed') {
      return comment;
    }

    return this.uow.run(async (scope) => {
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
          metadata: updated.postId ? { actorOrgUserId: actor.id } : undefined,
        }),
      ]);
      this.logger.info('comment removed', { orgId, commentId, actorId: actor.id });
      return updated;
    });
  }

  async restore(
    orgId: string,
    commentId: string,
    actor: Actor,
    communityId?: string,
  ): Promise<CommentView> {
    return this.renderOne(
      orgId,
      await this.restoreComment(orgId, commentId, actor, communityId),
      actor,
    );
  }

  private async restoreComment(
    orgId: string,
    commentId: string,
    actor: Actor,
    communityId?: string,
  ): Promise<Comment> {
    if (!this.isStaff(actor)) {
      throw new ForbiddenError('You cannot restore this comment');
    }
    const comment = await this.getComment(orgId, commentId);
    if (!comment || !this.inCommunity(comment, communityId)) {
      this.logger.warn('comment restore rejected — not found', {
        orgId,
        commentId,
        actorId: actor.id,
      });
      throw new NotFoundError('Comment', commentId);
    }
    if (comment.status !== 'removed') {
      return comment;
    }
    const updated = await this.repo.updateComment(orgId, commentId, {
      status: 'published',
      removedBy: null,
    });
    if (!updated) {
      // getComment() proved it existed; a null here means it vanished mid-write.
      // Returning the still-removed comment would report success while
      // handing back the removed row.
      throw new NotFoundError('Comment', commentId);
    }
    this.logger.info('comment restored', { orgId, commentId, actorId: actor.id });
    return updated;
  }

  /** Load a comment together with its activity's resolved comments config,
   *  having proved the actor may reach that activity at all. Every path that
   *  acts on one comment needs the pair, and none should read the row twice. */
  private async loadWithConfig(
    orgId: string,
    commentId: string,
    actor: Actor,
  ): Promise<{ comment: Comment; config: CommentsConfig }> {
    const comment = await this.getComment(orgId, commentId);
    if (!comment) {
      throw new NotFoundError('Comment', commentId);
    }
    if (comment.postId) {
      const { post, space } = await this.postOfComment(orgId, actor, commentId, comment.postId);
      const config: CommentsConfig = {
        enabled: this.commentsOpen(post, space),
        threaded: true,
        requireReview: false,
        reactions: post.reactionsEnabled ?? space.settings.reactions,
      };
      return { comment, config };
    }
    const activityId = this.activityIdOf(comment);
    if (!(await this.hasAccess(orgId, activityId, actor))) {
      throw new ForbiddenError('You cannot open this activity');
    }
    const config = await this.resolveConfig(orgId, activityId);
    return { comment, config };
  }

  async setReaction(
    orgId: string,
    commentId: string,
    actor: Actor,
    emoji: ReactionEmoji | null,
  ): Promise<CommentReactions> {
    const { comment, config } = await this.loadWithConfig(orgId, commentId, actor);
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
    await this.repo.setReaction(orgId, commentId, actor.id, emoji);
    const stored = await this.repo.reactionsOf(orgId, [commentId], actor.id);
    return stored[commentId] ?? EMPTY_REACTIONS;
  }

  async approve(orgId: string, commentId: string, actor: Actor): Promise<Comment> {
    if (!this.isStaff(actor)) {
      throw new ForbiddenError('You cannot approve this comment');
    }
    const comment = await this.getComment(orgId, commentId);
    if (!comment) {
      this.logger.warn('comment approve rejected — not found', {
        orgId,
        commentId,
        actorId: actor.id,
      });
      throw new NotFoundError('Comment', commentId);
    }
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
      await scope.outbox.append([discussionEvents.commentPublished.make({ orgId, data: updated })]);
      this.logger.info('comment published', { orgId, commentId, actorId: actor.id });
      return updated;
    });
  }

  /** Loads the comment and dispatches to whichever transition applies — the
   *  caller must not decide that itself. `approve` and `restore` still enforce
   *  their own staff check; the check here covers the third path, where a
   *  comment is already published and neither of them would run. */
  async publish(orgId: string, commentId: string, actor: Actor): Promise<Comment> {
    if (!this.isStaff(actor)) {
      throw new ForbiddenError('You cannot publish this comment');
    }
    const comment = await this.getComment(orgId, commentId);
    if (!comment) {
      this.logger.warn('comment publish rejected — not found', {
        orgId,
        commentId,
        actorId: actor.id,
      });
      throw new NotFoundError('Comment', commentId);
    }
    if (comment.status === 'pending') {
      return this.approve(orgId, commentId, actor);
    }
    if (comment.status === 'removed') {
      return this.restoreComment(orgId, commentId, actor);
    }
    return comment;
  }

  async resolveReports(
    orgId: string,
    commentId: string,
    actor: Actor,
    communityId?: string,
  ): Promise<void> {
    const comment = await this.getComment(orgId, commentId);
    if (!comment || !this.inCommunity(comment, communityId)) {
      this.logger.warn('comment reports resolve rejected — not found', {
        orgId,
        commentId,
        actorId: actor.id,
      });
      throw new NotFoundError('Comment', commentId);
    }
    if (comment.postId) {
      await this.postOfComment(orgId, actor, commentId, comment.postId);
      if (!this.canModerate(actor)) {
        throw new ForbiddenError('You cannot work this queue');
      }
    } else if (!this.isStaff(actor)) {
      throw new ForbiddenError('You cannot resolve this report');
    }
    await this.repo.resolveReportsFor(orgId, commentId, {
      resolvedAt: new Date(),
      resolvedBy: actor.id,
      resolution: 'dismissed',
    });
    this.logger.info('comment reports resolved', { orgId, commentId, actorId: actor.id });
  }

  async reportComment(
    orgId: string,
    commentId: string,
    actor: Actor,
    reason: string,
  ): Promise<CommentReport> {
    const { comment, config } = await this.loadWithConfig(orgId, commentId, actor);
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
          metadata: comment.postId ? { actorOrgUserId: actor.id } : undefined,
        }),
      ]);
      this.logger.info('comment reported', { orgId, commentId, actorId: actor.id });
      return saved;
    });
  }

  async listComments(orgId: string, query: ListCommentsQuery): Promise<Page<CommentListItem>> {
    const page = await this.repo.listComments(orgId, query);
    const rows = page.rows.map((r) => r.comment);
    if (rows.length === 0) {
      return { ...page, rows: [] };
    }
    const reports = await this.repo.listOpenReports(
      orgId,
      rows.map((c) => c.id),
    );
    const authors = await this.repo.authorsOf(orgId, [
      ...new Set([...this.peopleIn(rows), ...reports.map((r) => r.orgUserId)]),
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
          author: authorView(orgId, author, urls),
          authorEmail: author.email,
          removedBy: comment.removedBy,
          reports: (byComment.get(comment.id) ?? []).map((r) => {
            const reporter = authors[r.orgUserId];
            if (!reporter) {
              throw new NotFoundError('Member', r.orgUserId);
            }
            return {
              reporter: authorView(orgId, reporter, urls),
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

  async sendDigest(orgId: string, now: Date): Promise<void> {
    const communityIds = await this.communities.listIds(orgId);
    if (communityIds.length === 0) {
      this.logger.debug('no communities for digest', { orgId });
      return;
    }
    const period = now.toISOString().slice(0, 10);
    await this.uow.run(async ({ outbox }) => {
      await outbox.append(
        communityIds.map((communityId) =>
          discussionEvents.digestDue.make({
            orgId,
            data: { communityId, period },
          }),
        ),
      );
    });
    this.logger.info('digest due', { orgId, communities: communityIds.length, period });
  }
}
