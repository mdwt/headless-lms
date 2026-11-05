import { CommentIdParam, CommentsQuery, ReplyToComment } from '../../schemas/index.js';
import { defineTool, type Tool } from '../tool.js';

export const commentTools: Tool[] = [
  defineTool({
    name: 'list_comments',
    title: 'List comments',
    description:
      'The comment moderation queue. Filter by status, reported, course, activity or author. Each comment carries its activityId and parentId.',
    operation: 'discussion.listComments',
    kind: 'read',
    idempotent: true,
    openWorld: false,
    input: CommentsQuery,
    call: (input, { container, caller }) => container.discussion.listComments(input, caller.actor),
  }),
  defineTool({
    name: 'publish_comment',
    title: 'Publish comment',
    description: 'Publish a comment: approves one waiting for review, or restores a removed one.',
    operation: 'discussion.publish',
    kind: 'write',
    idempotent: true,
    openWorld: false,
    input: CommentIdParam,
    call: ({ commentId }, { container, caller }) =>
      container.discussion.publish(commentId, 'lesson', caller.actor),
  }),
  defineTool({
    name: 'dismiss_comment_reports',
    title: 'Dismiss comment reports',
    description: "Mark the reports on a comment as resolved. The comment's status does not change.",
    operation: 'discussion.resolveReports',
    kind: 'write',
    idempotent: true,
    openWorld: false,
    input: CommentIdParam,
    call: ({ commentId }, { container, caller }) =>
      container.discussion.resolveReports(commentId, 'lesson', caller.actor),
  }),
  defineTool({
    name: 'reply_to_comment',
    title: 'Reply to comment',
    description:
      'Reply to a published comment as yourself. A reply to a reply attaches to its top-level comment.',
    operation: 'discussion.replyToComment',
    kind: 'write',
    idempotent: false,
    openWorld: false,
    input: ReplyToComment.extend(CommentIdParam.shape),
    call: ({ commentId, body }, { container, caller }) =>
      container.discussion.replyToComment(commentId, body, caller.actor),
  }),
  defineTool({
    name: 'remove_comment',
    title: 'Remove comment',
    description: 'Take a comment down.',
    operation: 'discussion.remove',
    listedFor: ['courses:moderate'],
    kind: 'destructive',
    idempotent: true,
    openWorld: false,
    input: CommentIdParam,
    call: ({ commentId }, { container, caller }) =>
      container.discussion.remove(commentId, 'lesson', caller.actor),
  }),
];
