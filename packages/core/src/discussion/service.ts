import { genId } from '../shared/id.js';
import { ForbiddenError, NotFoundError } from '../shared/errors.js';
import type { Logger } from '../shared/ports.js';
import { noopLogger } from '../shared/logger.js';
import type { Comment, CommentAuthor, CommentReport, CommentSettings } from './model.js';
import type { ActivitySettings, CourseSettings } from '../types/index.js';
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
  CourseAccessReader,
  DiscussionRepository,
  DiscussionService,
  DiscussionUnitOfWork,
  PostCommentInput,
} from './ports.js';
import { discussionEvents } from './events.js';

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
  access: CourseAccessReader;
  content: ActivityGetter;
  uow: DiscussionUnitOfWork;
  settings: SettingsService;
  logger?: Logger;
};

export class DiscussionServiceImpl implements DiscussionService {
  private readonly repo: DiscussionRepository;
  private readonly access: CourseAccessReader;
  private readonly content: ActivityGetter;
  private readonly uow: DiscussionUnitOfWork;
  private readonly settings: SettingsService;
  private readonly logger: Logger;

  constructor(params: DiscussionServiceParams) {
    this.repo = params.repo;
    this.access = params.access;
    this.content = params.content;
    this.uow = params.uow;
    this.settings = params.settings;
    this.logger = params.logger ?? noopLogger;
  }

  async resolveConfig(orgId: string, activityId: string): Promise<CommentsConfig> {
    const activity = await this.content.getActivity(orgId, activityId);
    if (!activity) {
      throw new NotFoundError('Activity', activityId);
    }

    // The `content` namespace row is the whole CourseSettings; the `comments`
    // key inside it is owned by this context (commentSettingsSchema).
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

  /** Any org user that is not a learner moderates. The role arrives from
   *  the edge already resolved; core never looks one up to authorise. */
  private isStaff(actor: Actor): boolean {
    return actor.role !== 'student';
  }

  private toAuthor(record: AuthorRecord): CommentAuthor {
    return {
      id: record.id,
      firstName: record.firstName,
      lastName: record.lastName,
      image: record.image,
      role: record.role,
    };
  }

  private toView(
    comment: Comment,
    authors: Record<string, AuthorRecord>,
    reactions: CommentReactions,
  ): CommentView {
    const author = authors[comment.orgUserId];
    if (!author) {
      throw new NotFoundError('OrgUser', comment.orgUserId);
    }
    if (comment.removedBy && !authors[comment.removedBy]) {
      throw new NotFoundError('OrgUser', comment.removedBy);
    }
    const remover = comment.removedBy ? authors[comment.removedBy] : undefined;
    return {
      id: comment.id,
      activityId: comment.activityId,
      parentId: comment.parentId,
      author: this.toAuthor(author),
      body: comment.status === 'removed' ? null : comment.body,
      status: comment.status,
      removedBy: remover ? this.toAuthor(remover) : null,
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
    return this.toView(comment, authors, stored);
  }

  private async hasAccess(orgId: string, activityId: string, actor: Actor): Promise<boolean> {
    return (
      this.isStaff(actor) ||
      (await (async () => {
        const activity = await this.content.getActivity(orgId, activityId);
        return activity ? this.access.hasCourseAccess(orgId, actor.id, activity.courseId) : false;
      })())
    );
  }

  async postComment(
    orgId: string,
    { activityId, actor, parentId, body }: PostCommentInput,
  ): Promise<CommentView> {
    await this.hasAccess(orgId, activityId, actor);
    const config = await this.resolveConfig(orgId, activityId);

    if (!config.enabled) {
      throw new ForbiddenError('discussion is not open on this activity');
    }

    if (parentId !== null) {
      if (!config.threaded) {
        throw new ForbiddenError('replies are disabled on this course');
      }
      const parent = await this.repo.findComment(orgId, parentId);
      if (!parent || parent.activityId !== activityId) {
        throw new NotFoundError('Comment', parentId);
      }

      if (parent.parentId !== null) {
        throw new ForbiddenError('replies nest one level');
      }

      if (parent.status !== 'published') {
        throw new ForbiddenError('cannot reply to a comment that is not published');
      }
    }

    const status: Comment['status'] =
      config.requireReview && !this.isStaff(actor) ? 'pending' : 'published';

    const comment: Comment = {
      id: genId('comment'),
      orgId,
      activityId: activityId,
      parentId: parentId,
      orgUserId: actor.id,
      body: body,
      status,
      removedBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const saved = await this.uow.run(async (scope) => {
      const row = await scope.discussion.insertComment(orgId, comment);
      await scope.outbox.append([discussionEvents.commentCreated.make({ orgId, data: row })]);
      this.logger.info('comment created', { orgId, commentId: row.id, status });
      return row;
    });
    return this.renderOne(orgId, saved, actor);
  }

  async activityComments(
    orgId: string,
    activityId: string,
    actor: Actor,
  ): Promise<ActivityComments> {
    const config = await this.resolveConfig(orgId, activityId);
    if (!config.enabled) {
      return { config, comments: [] };
    }
    const rows = await this.repo.listByActivity(orgId, activityId);
    // A pending comment is visible to its own author and to staff, nobody else.
    const readable = rows.filter((c) => {
      if (c.status === 'published' || c.status === 'removed') {
        return true;
      }
      return this.isStaff(actor) || c.orgUserId === actor.id;
    });
    // Replies nest one level, so a reply has nothing hanging off it — a removed
    // reply is simply dropped rather than held open as a placeholder.
    const replies = readable.filter((c) => c.parentId !== null && c.status !== 'removed');
    const heldOpen = new Set(replies.map((r) => r.parentId));
    // A removed root survives only to hold replies THIS reader can see. Judging
    // it against every reply would show a marker with nothing beneath it.
    const roots = readable.filter(
      (c) => c.parentId === null && (c.status !== 'removed' || heldOpen.has(c.id)),
    );
    const rootIds = new Set(roots.map((r) => r.id));
    const served = [...roots, ...replies.filter((r) => rootIds.has(r.parentId!))].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    );

    const [authors, reactions] = await Promise.all([
      this.repo.authorsOf(orgId, this.peopleIn(served)),
      config.reactions
        ? this.repo.reactionsOf(
            orgId,
            served.map((c) => c.id),
            actor.id,
          )
        : Promise.resolve<Record<string, CommentReactions>>({}),
    ]);

    return {
      config,
      comments: served.map((c) => this.toView(c, authors, reactions[c.id] ?? EMPTY_REACTIONS)),
    };
  }

  async edit(orgId: string, commentId: string, actor: Actor, body: string): Promise<CommentView> {
    const { comment, config } = await this.loadWithConfig(orgId, commentId, actor);
    if (!config.enabled) {
      throw new ForbiddenError('discussion is not open on this activity');
    }
    // Editing is the author's alone — moderators remove, they do not rewrite.
    if (comment.orgUserId !== actor.id) {
      throw new ForbiddenError('only the author may edit a comment');
    }
    if (comment.status === 'removed') {
      throw new ForbiddenError('a removed comment cannot be edited');
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

  async remove(orgId: string, commentId: string, actor: Actor): Promise<Comment> {
    const comment = await this.getComment(orgId, commentId);
    if (!comment) {
      throw new NotFoundError('Comment', commentId);
    }

    await this.hasAccess(orgId, comment.activityId, actor);
    if (comment.orgUserId !== actor.id && !this.isStaff(actor)) {
      throw new ForbiddenError('only the author or a moderator may remove a comment');
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
      await scope.outbox.append([discussionEvents.commentRemoved.make({ orgId, data: updated })]);
      this.logger.info('comment removed', { orgId, commentId, by: actor.id });
      return updated;
    });
  }

  async restore(orgId: string, commentId: string, actor: Actor): Promise<Comment> {
    if (!this.isStaff(actor)) {
      throw new ForbiddenError('only a moderator may restore a comment');
    }
    const comment = await this.getComment(orgId, commentId);
    if (!comment) {
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
    await this.hasAccess(orgId, comment.activityId, actor);
    const config = await this.resolveConfig(orgId, comment.activityId);
    return { comment, config };
  }

  async setReaction(
    orgId: string,
    commentId: string,
    actor: Actor,
    emoji: ReactionEmoji | null,
  ): Promise<CommentReactions> {
    const { comment, config } = await this.loadWithConfig(orgId, commentId, actor);
    // Writing to comments — locked and hidden both refuse.
    if (!config.enabled) {
      throw new ForbiddenError('discussion is not open on this activity');
    }
    if (!config.reactions && emoji !== null) {
      throw new ForbiddenError('reactions are disabled on this course');
    }
    if (comment.status === 'removed') {
      throw new ForbiddenError('a removed comment cannot be reacted to');
    }
    await this.repo.setReaction(orgId, commentId, actor.id, emoji);
    const stored = await this.repo.reactionsOf(orgId, [commentId], actor.id);
    return stored[commentId] ?? EMPTY_REACTIONS;
  }

  async approve(orgId: string, commentId: string, actor: Actor): Promise<Comment> {
    if (!this.isStaff(actor)) {
      throw new ForbiddenError('only a moderator may approve a comment');
    }
    const comment = await this.getComment(orgId, commentId);
    if (!comment) {
      throw new NotFoundError('Comment', commentId);
    }
    if (comment.status !== 'pending') {
      throw new ForbiddenError('only a pending comment can be approved');
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
      this.logger.info('comment published', { orgId, commentId });
      return updated;
    });
  }

  /** Loads the comment and dispatches to whichever transition applies — the
   *  caller must not decide that itself. `approve` and `restore` still enforce
   *  their own staff check; the check here covers the third path, where a
   *  comment is already published and neither of them would run. */
  async publish(orgId: string, commentId: string, actor: Actor): Promise<Comment> {
    if (!this.isStaff(actor)) {
      throw new ForbiddenError('only a moderator may publish a comment');
    }
    const comment = await this.getComment(orgId, commentId);
    if (!comment) {
      throw new NotFoundError('Comment', commentId);
    }
    if (comment.status === 'pending') {
      return this.approve(orgId, commentId, actor);
    }
    if (comment.status === 'removed') {
      return this.restore(orgId, commentId, actor);
    }
    return comment;
  }

  async resolveReports(orgId: string, commentId: string, actor: Actor): Promise<void> {
    if (!this.isStaff(actor)) {
      throw new ForbiddenError('only a moderator may resolve a report');
    }
    const comment = await this.getComment(orgId, commentId);
    if (!comment) {
      throw new NotFoundError('Comment', commentId);
    }
    await this.repo.resolveReportsFor(orgId, commentId, new Date());
    this.logger.info('comment reports resolved', { orgId, commentId });
  }

  async reportComment(
    orgId: string,
    commentId: string,
    actor: Actor,
    reason: string,
  ): Promise<CommentReport> {
    const { config } = await this.loadWithConfig(orgId, commentId, actor);
    // Locked accepts reports — a locked activity can still hold something a
    // moderator needs to see. Hidden does not: nothing in it is being served,
    // so nobody is looking at a comment to flag.
    if (!config.enabled) {
      throw new ForbiddenError('discussion is not open on this activity');
    }
    const now = new Date();
    const report: CommentReport = {
      id: genId('commentReport'),
      orgId,
      commentId,
      orgUserId: actor.id,
      reason,
      resolvedAt: null,
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
      await scope.outbox.append([discussionEvents.commentReported.make({ orgId, data: saved })]);
      this.logger.info('comment reported', { orgId, commentId });
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

    const byComment = new Map<string, CommentReport[]>();
    for (const report of reports) {
      byComment.set(report.commentId, [...(byComment.get(report.commentId) ?? []), report]);
    }

    return {
      ...page,
      rows: page.rows.map(({ comment, courseId, activityTitle }) => {
        const author = authors[comment.orgUserId];
        if (!author) {
          throw new NotFoundError('OrgUser', comment.orgUserId);
        }
        return {
          id: comment.id,
          parentId: comment.parentId,
          activityId: comment.activityId,
          activityTitle,
          courseId,
          body: comment.body,
          status: comment.status,
          author: this.toAuthor(author),
          authorEmail: author.email,
          removedBy: comment.removedBy,
          reports: (byComment.get(comment.id) ?? []).map((r) => {
            const reporter = authors[r.orgUserId];
            if (!reporter) {
              throw new NotFoundError('OrgUser', r.orgUserId);
            }
            return {
              reporter: this.toAuthor(reporter),
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
