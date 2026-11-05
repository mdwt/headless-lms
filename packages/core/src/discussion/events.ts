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
  reactionEmojiSchema,
} from '../types/schemas/index.js';
import {
  defineEvent,
  type EventOf,
  type EventOfValues,
  type NewDomainEvent,
} from '../shared/ports.js';

const mentioned = { mentionedOrgUserIds: z.array(idSchema) };
const commentEventSchema = commentSchema.extend(mentioned);
const postEventSchema = postSchema.extend(mentioned);
const publicPost = postSchema.strip();
const eventMessageSchema = messageSchema.omit({ clientId: true });
const messageEventSchema = eventMessageSchema.extend(mentioned);

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

const reportedComment = commentReportSchema.extend({ communityId: idSchema.nullable() });
const publicCommentReport = reportedComment
  .pick({
    id: true,
    orgId: true,
    communityId: true,
    commentId: true,
    orgUserId: true,
    reason: true,
    resolvedAt: true,
    createdAt: true,
    updatedAt: true,
  })
  .strip();
const reportedPost = postFlagSchema.extend({ communityId: idSchema });

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

const publicMessage = messageSchema.omit({ body: true, clientId: true }).strip();

const postReactionAddedSchema = z
  .object({
    postId: idSchema,
    spaceId: idSchema,
    communityId: idSchema,
    orgUserId: idSchema,
    reaction: reactionEmojiSchema,
  })
  .strict();

const commentReactionAddedSchema = z
  .object({
    commentId: idSchema,
    postId: idSchema.nullable(),
    activityId: idSchema.nullable(),
    spaceId: idSchema.nullable(),
    communityId: idSchema.nullable(),
    orgUserId: idSchema,
    reaction: reactionEmojiSchema,
  })
  .strict();

const messageReactionAddedSchema = z
  .object({
    messageId: idSchema,
    chatId: idSchema,
    communityId: idSchema,
    orgUserId: idSchema,
    reaction: reactionEmojiSchema,
  })
  .strict();

const messageReactionsChangedSchema = z
  .object({
    messageId: idSchema,
    chatId: idSchema,
    communityId: idSchema,
    orgUserId: idSchema,
    reaction: reactionEmojiSchema.nullable(),
  })
  .strict();

const chatReadSchema = z
  .object({
    chatId: idSchema,
    communityId: idSchema,
    orgUserId: idSchema,
    lastReadMessageId: idSchema,
  })
  .strict();

const chatMutedSchema = z
  .object({
    chatId: idSchema,
    communityId: idSchema,
    orgUserId: idSchema,
    mutedUntil: z.coerce.date().nullable(),
  })
  .strict();

const digestDueSchema = z
  .object({ communityId: idSchema, from: z.coerce.date(), to: z.coerce.date() })
  .strict();
const publicMessageFlag = messageFlagSchema.omit({ reason: true }).strip();

export const discussionEvents = {
  commentCreated: defineEvent({
    type: 'discussion.comment.created',
    version: 1,
    data: commentEventSchema,
    publicData: publicComment,
  }),
  commentPublished: defineEvent({
    type: 'discussion.comment.published',
    version: 1,
    data: commentEventSchema,
    publicData: publicComment,
  }),
  commentUpdated: defineEvent({
    type: 'discussion.comment.updated',
    version: 1,
    data: commentEventSchema,
    publicData: publicComment,
  }),
  commentReactionAdded: defineEvent({
    type: 'discussion.comment.reaction.added',
    version: 1,
    data: commentReactionAddedSchema,
    publicData: commentReactionAddedSchema,
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
    data: reportedComment,
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
    data: postEventSchema,
    publicData: publicPost,
  }),
  postPublished: defineEvent({
    type: 'discussion.post.published',
    version: 1,
    data: postEventSchema,
    publicData: publicPost,
  }),
  postReactionAdded: defineEvent({
    type: 'discussion.post.reaction.added',
    version: 1,
    data: postReactionAddedSchema,
    publicData: postReactionAddedSchema,
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
    data: reportedPost,
    publicData: reportedPost,
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
  chatRead: defineEvent({
    type: 'discussion.chat.read',
    version: 1,
    data: chatReadSchema,
  }),
  chatMuted: defineEvent({
    type: 'discussion.chat.muted',
    version: 1,
    data: chatMutedSchema,
  }),
  messageSent: defineEvent({
    type: 'discussion.message.sent',
    version: 1,
    data: messageEventSchema,
    publicData: publicMessage,
  }),
  messageUpdated: defineEvent({
    type: 'discussion.message.updated',
    version: 1,
    data: messageEventSchema,
    publicData: publicMessage,
  }),
  messageReactionAdded: defineEvent({
    type: 'discussion.message.reaction.added',
    version: 1,
    data: messageReactionAddedSchema,
    publicData: messageReactionAddedSchema,
  }),
  messageReactionsChanged: defineEvent({
    type: 'discussion.message.reactions.changed',
    version: 1,
    data: messageReactionsChangedSchema,
  }),
  messageDeleted: defineEvent({
    type: 'discussion.message.deleted',
    version: 1,
    data: eventMessageSchema,
    publicData: publicMessage,
  }),
  messageReported: defineEvent({
    type: 'discussion.message.reported',
    version: 1,
    data: messageFlagSchema,
    publicData: publicMessageFlag,
  }),
  digestDue: defineEvent({
    type: 'discussion.digest.due',
    version: 2,
    data: digestDueSchema,
    publicData: digestDueSchema,
  }),
};

export type CommentCreated = EventOf<typeof discussionEvents.commentCreated>;
export type CommentPublished = EventOf<typeof discussionEvents.commentPublished>;
export type CommentUpdated = EventOf<typeof discussionEvents.commentUpdated>;
export type CommentReactionAdded = EventOf<typeof discussionEvents.commentReactionAdded>;
export type CommentRemoved = EventOf<typeof discussionEvents.commentRemoved>;
export type CommentReported = EventOf<typeof discussionEvents.commentReported>;
export type DiscussionEvent = EventOfValues<typeof discussionEvents>;
export type PostCreated = EventOf<typeof discussionEvents.postCreated>;
export type PostUpdated = EventOf<typeof discussionEvents.postUpdated>;
export type PostPublished = EventOf<typeof discussionEvents.postPublished>;
export type PostReactionAdded = EventOf<typeof discussionEvents.postReactionAdded>;
export type PostRemoved = EventOf<typeof discussionEvents.postRemoved>;
export type PostReported = EventOf<typeof discussionEvents.postReported>;
export type ChatCreated = EventOf<typeof discussionEvents.chatCreated>;
export type ChatUpdated = EventOf<typeof discussionEvents.chatUpdated>;
export type ChatParticipantAdded = EventOf<typeof discussionEvents.chatParticipantAdded>;
export type ChatRead = EventOf<typeof discussionEvents.chatRead>;
export type ChatMuted = EventOf<typeof discussionEvents.chatMuted>;
export type MessageSent = EventOf<typeof discussionEvents.messageSent>;
export type MessageUpdated = EventOf<typeof discussionEvents.messageUpdated>;
export type MessageReactionAdded = EventOf<typeof discussionEvents.messageReactionAdded>;
export type MessageReactionsChanged = EventOf<typeof discussionEvents.messageReactionsChanged>;
export type MessageDeleted = EventOf<typeof discussionEvents.messageDeleted>;
export type MessageReported = EventOf<typeof discussionEvents.messageReported>;
export type DigestDue = EventOf<typeof discussionEvents.digestDue>;
export type NewDiscussionEvent = NewDomainEvent<DiscussionEvent>;
