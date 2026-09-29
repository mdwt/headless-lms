import { commentReportSchema, commentSchema } from '../types/schemas/index.js';
import {
  defineEvent,
  type EventOf,
  type EventOfValues,
  type NewDomainEvent,
} from '../shared/ports.js';

const publicComment = commentSchema
  .pick({
    id: true,
    orgId: true,
    activityId: true,
    parentId: true,
    orgUserId: true,
    body: true,
    status: true,
    removedBy: true,
    createdAt: true,
    updatedAt: true,
  })
  .strip();

const publicCommentReport = commentReportSchema
  .pick({
    id: true,
    orgId: true,
    commentId: true,
    orgUserId: true,
    reason: true,
    resolvedAt: true,
    createdAt: true,
    updatedAt: true,
  })
  .strip();

export const discussionEvents = {
  commentCreated: defineEvent({
    type: 'discussion.comment.created',
    version: 1,
    data: commentSchema,
    publicData: publicComment,
  }),
  commentPublished: defineEvent({
    type: 'discussion.comment.published',
    version: 1,
    data: commentSchema,
    publicData: publicComment,
  }),
  commentRemoved: defineEvent({
    type: 'discussion.comment.removed',
    version: 1,
    data: commentSchema,
    publicData: publicComment,
  }),
  commentReported: defineEvent({
    type: 'discussion.comment.reported',
    version: 1,
    data: commentReportSchema,
    publicData: publicCommentReport,
  }),
};

export type CommentCreated = EventOf<typeof discussionEvents.commentCreated>;
export type CommentPublished = EventOf<typeof discussionEvents.commentPublished>;
export type CommentRemoved = EventOf<typeof discussionEvents.commentRemoved>;
export type CommentReported = EventOf<typeof discussionEvents.commentReported>;
export type CommentEvent = EventOfValues<typeof discussionEvents>;
export type NewDiscussionEvent = NewDomainEvent<CommentEvent>;
