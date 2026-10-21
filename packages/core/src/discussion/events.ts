import { z } from 'zod';
import {
  chatSchema,
  commentReportSchema,
  commentSchema,
  idSchema,
  messageFlagSchema,
  messageSchema,
  postFlagSchema,
  postSchema,
} from '../types/schemas/index.js';
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
    postId: true,
    communityId: true,
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

const chatEventSchema = chatSchema.extend({
  participantIds: z.array(idSchema),
});

const publicChat = chatEventSchema
  .pick({
    id: true,
    orgId: true,
    communityId: true,
    kind: true,
    status: true,
    createdBy: true,
    participantIds: true,
  })
  .strip();

const participantAddedSchema = z
  .object({
    chatId: idSchema,
    communityId: idSchema,
    orgUserId: idSchema,
    addedBy: idSchema,
  })
  .strict();

const publicMessage = messageSchema.omit({ body: true });
const publicMessageFlag = messageFlagSchema.omit({ reason: true });

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
  postCreated: defineEvent({
    type: 'discussion.post.created',
    version: 1,
    data: postSchema,
    publicData: postSchema,
  }),
  postUpdated: defineEvent({
    type: 'discussion.post.updated',
    version: 1,
    data: postSchema,
    publicData: postSchema,
  }),
  postPublished: defineEvent({
    type: 'discussion.post.published',
    version: 1,
    data: postSchema,
    publicData: postSchema,
  }),
  postRemoved: defineEvent({
    type: 'discussion.post.removed',
    version: 1,
    data: postSchema,
    publicData: postSchema,
  }),
  postReported: defineEvent({
    type: 'discussion.post.reported',
    version: 1,
    data: postFlagSchema,
    publicData: postFlagSchema,
  }),
  chatCreated: defineEvent({
    type: 'discussion.chat.created',
    version: 1,
    data: chatEventSchema,
    publicData: publicChat,
  }),
  chatUpdated: defineEvent({
    type: 'discussion.chat.updated',
    version: 1,
    data: chatEventSchema,
    publicData: publicChat,
  }),
  chatParticipantAdded: defineEvent({
    type: 'discussion.chat.participant.added',
    version: 1,
    data: participantAddedSchema,
    publicData: participantAddedSchema,
  }),
  messageSent: defineEvent({
    type: 'discussion.message.sent',
    version: 1,
    data: messageSchema,
    publicData: publicMessage,
  }),
  messageDeleted: defineEvent({
    type: 'discussion.message.deleted',
    version: 1,
    data: messageSchema,
    publicData: publicMessage,
  }),
  messageReported: defineEvent({
    type: 'discussion.message.reported',
    version: 1,
    data: messageFlagSchema,
    publicData: publicMessageFlag,
  }),
};

export type CommentCreated = EventOf<typeof discussionEvents.commentCreated>;
export type CommentPublished = EventOf<typeof discussionEvents.commentPublished>;
export type CommentRemoved = EventOf<typeof discussionEvents.commentRemoved>;
export type CommentReported = EventOf<typeof discussionEvents.commentReported>;
export type CommentEvent = EventOfValues<typeof discussionEvents>;
export type PostCreated = EventOf<typeof discussionEvents.postCreated>;
export type PostUpdated = EventOf<typeof discussionEvents.postUpdated>;
export type PostPublished = EventOf<typeof discussionEvents.postPublished>;
export type PostRemoved = EventOf<typeof discussionEvents.postRemoved>;
export type PostReported = EventOf<typeof discussionEvents.postReported>;
export type ChatCreated = EventOf<typeof discussionEvents.chatCreated>;
export type ChatUpdated = EventOf<typeof discussionEvents.chatUpdated>;
export type ChatParticipantAdded = EventOf<typeof discussionEvents.chatParticipantAdded>;
export type MessageSent = EventOf<typeof discussionEvents.messageSent>;
export type MessageDeleted = EventOf<typeof discussionEvents.messageDeleted>;
export type MessageReported = EventOf<typeof discussionEvents.messageReported>;
export type NewDiscussionEvent = NewDomainEvent<CommentEvent>;
