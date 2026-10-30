import {
  CommentIdParam,
  CommentsQuery,
  DiscussionActivityParam,
  ReplyToComment,
} from '../../schemas/index.js';
import { actor, defineTool, type Tool } from '../tool.js';

export const commentTools: Tool[] = [
  defineTool({
    name: 'list_comments',
    title: 'List comments',
    description:
      'The comment moderation queue. Filter by status, reported, course, activity or author. Each comment carries its activityId and parentId.',
    scope: 'comments:read',
    kind: 'read',
    idempotent: true,
    openWorld: false,
    input: CommentsQuery,
    call: (input, { container, scope }) => container.discussion.listComments(scope.orgId, input),
  }),
  defineTool({
    name: 'publish_comment',
    title: 'Publish comment',
    description: 'Publish a comment: approves one waiting for review, or restores a removed one.',
    scope: 'comments:moderate',
    kind: 'write',
    idempotent: true,
    openWorld: false,
    input: CommentIdParam,
    call: ({ commentId }, { container, scope }) =>
      container.discussion.publish(scope.orgId, commentId, actor(scope), null),
  }),
  defineTool({
    name: 'dismiss_comment_reports',
    title: 'Dismiss comment reports',
    description: "Mark the reports on a comment as resolved. The comment's status does not change.",
    scope: 'comments:moderate',
    kind: 'write',
    idempotent: true,
    openWorld: false,
    input: CommentIdParam,
    call: ({ commentId }, { container, scope }) =>
      container.discussion.resolveReports(scope.orgId, commentId, actor(scope), null),
  }),
  defineTool({
    name: 'reply_to_comment',
    title: 'Reply to comment',
    description:
      'Reply to a published top-level comment as yourself. Pass its activityId and its id. To answer a reply, reply to its parentId.',
    scope: 'comments:moderate',
    kind: 'write',
    idempotent: false,
    openWorld: false,
    input: ReplyToComment.extend(CommentIdParam.shape).extend(DiscussionActivityParam.shape),
    call: ({ activityId, commentId, body }, { container, scope }) =>
      container.discussion.postComment(scope.orgId, {
        actor: actor(scope),
        activityId,
        parentId: commentId,
        body,
      }),
  }),
  defineTool({
    name: 'remove_comment',
    title: 'Remove comment',
    description: 'Take a comment down.',
    scope: 'comments:moderate',
    kind: 'destructive',
    idempotent: true,
    openWorld: false,
    input: CommentIdParam,
    call: ({ commentId }, { container, scope }) =>
      container.discussion.remove(scope.orgId, commentId, actor(scope), null),
  }),
];
