// Discussion resource schemas. Comments attach to an activity; settings are
// per course, with a per-activity override carried on the activity's own
// settings blob rather than a resource of its own.
//
// The author is the org user's profile minus its email — learners read each
// other's comments and the list must not be a directory of the cohort's
// addresses. The staff-facing comment list carries `authorEmail` separately.
import type { CommentSettings as DomainCommentSettings } from '@headless-lms/core/types';
import {
  commentAuthorSchema,
  commentListItemSchema,
  commentReportSummarySchema,
  commentSchema,
  commentStatusSchema,
  commentViewSchema,
} from '@headless-lms/core/schemas';
import { z } from 'zod';
import { ListQuery, type Matches, paginated } from './shared.js';

export const CommentStatus = commentStatusSchema;
export type CommentStatus = z.infer<typeof CommentStatus>;

export const CommentAuthor = commentAuthorSchema;
export type CommentAuthor = z.infer<typeof CommentAuthor>;

/** Any single emoji. Open, so widening the picker needs no schema change. */
export const ReactionEmoji = z.string().min(1).max(16);
export type ReactionEmoji = z.infer<typeof ReactionEmoji>;

/** Counts by emoji; unused ones are absent, so no reactions serves `{}`. */
export const ReactionCounts = z.record(z.string(), z.number().int());
export type ReactionCounts = z.infer<typeof ReactionCounts>;

export const CommentView = commentViewSchema;
export type CommentView = z.infer<typeof CommentView>;

/** What the reaction write returns, so the client never recomputes a count. */
export const CommentReactions = z.object({
  reactions: ReactionCounts,
  viewerReaction: ReactionEmoji.optional(),
});
export type CommentReactions = z.infer<typeof CommentReactions>;

/** A course's comment settings. Stored under the course, carried on the course
 *  payload as `settings.comments`. */
export const CommentSettings = z.object({
  enabled: z.boolean(),
  threaded: z.boolean(),
  requireReview: z.boolean(),
  reactions: z.boolean(),
});
export type CommentSettings = z.infer<typeof CommentSettings>;
type _CommentSettingsMatchesDomain = Matches<DomainCommentSettings, CommentSettings> &
  Matches<CommentSettings, DomainCommentSettings>;

/** The course settings with the activity's override applied: `enabled` is the
 *  resolved answer for this activity, not the course switch. */
export const CommentsConfig = CommentSettings;
export type CommentsConfig = z.infer<typeof CommentsConfig>;

export const ActivityComments = z.object({
  config: CommentsConfig,
  comments: z.array(CommentView),
});
export type ActivityComments = z.infer<typeof ActivityComments>;

export const PostComment = z.object({
  body: z.string().min(1).max(10_000),
  parentId: z.string().nullable().default(null),
});
export type PostComment = z.infer<typeof PostComment>;

export const EditComment = z.object({
  body: z.string().min(1).max(10_000),
});
export type EditComment = z.infer<typeof EditComment>;

/** The staff PATCH writes status and nothing else: publishing covers approving
 *  a pending comment and restoring a removed one. Revising the text is the
 *  author's own edit, under /api/learn. */
export const PatchComment = z.object({
  status: z.literal('published'),
});
export type PatchComment = z.infer<typeof PatchComment>;

/** Replaces whatever the reader had. Clearing is DELETE, which carries no body. */
export const SetCommentReaction = z.object({
  emoji: ReactionEmoji,
});
export type SetCommentReaction = z.infer<typeof SetCommentReaction>;

/** A moderator's reply, posted from the queue against the comment it answers. */
export const ReplyToComment = z.object({
  body: z.string().min(1).max(10_000),
});
export type ReplyToComment = z.infer<typeof ReplyToComment>;

export const ReportComment = z.object({
  reason: z.string().max(1_000).default(''),
});
export type ReportComment = z.infer<typeof ReportComment>;

export const Comment = commentSchema;
export type Comment = z.infer<typeof Comment>;

export const CommentReport = z.object({
  id: z.string(),
  commentId: z.string(),
  orgUserId: z.string(),
  reason: z.string(),
  resolvedAt: z.date().nullable(),
  createdAt: z.date(),
});
export type CommentReport = z.infer<typeof CommentReport>;

/** An unresolved report on a listed comment. Resolved ones are history and are
 *  never served here. */
export const CommentReportSummary = commentReportSummarySchema;
export type CommentReportSummary = z.infer<typeof CommentReportSummary>;

/** One row of the staff comment list: the comment plus the context a
 *  moderation decision needs, so the list needs no follow-up request. */
export const CommentListItem = commentListItemSchema;
export type CommentListItem = z.infer<typeof CommentListItem>;

export const CommentsQuery = ListQuery.extend({
  status: CommentStatus.optional(),
  /** true = only comments carrying an unresolved report, false = only those
   *  carrying none. `z.stringbool` because query values arrive as strings and
   *  `z.coerce.boolean()` would read "false" as true. */
  reported: z.stringbool().optional(),
  courseId: z.string().optional(),
  activityId: z.string().optional(),
  /** Scope to one author (org_users.id). */
  orgUserId: z.string().optional(),
});
export type CommentsQuery = z.infer<typeof CommentsQuery>;

export const CommentsPage = paginated(CommentListItem);
export type CommentsPage = z.infer<typeof CommentsPage>;

export const DiscussionActivityParam = z.object({ activityId: z.string() });
export type DiscussionActivityParam = z.infer<typeof DiscussionActivityParam>;

export const CommentIdParam = z.object({ commentId: z.string() });
export type CommentIdParam = z.infer<typeof CommentIdParam>;
