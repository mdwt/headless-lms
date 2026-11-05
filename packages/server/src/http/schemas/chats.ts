import { z } from 'zod';
import {
  chatLastMessageSchema,
  chatLiveEventSchema,
  chatSchema,
  chatUnreadSummarySchema,
  commentAuthorSchema,
  idSchema,
  messageFlagResolutionSchema,
  messageFlagSchema,
  messageViewSchema,
  subscriptionViewSchema,
} from '@headless-lms/core/schemas';
import { PageQuery, paginated } from './shared.js';

export const Chat = chatSchema;
export const MessageFlag = messageFlagSchema;
export const MessageView = messageViewSchema;
export const MessagesPage = paginated(MessageView);

export const ChatListItem = z.object({
  chat: Chat,
  participantIds: z.array(z.string()),
  participants: z
    .array(commentAuthorSchema)
    .describe('The profiles of the people in `participantIds`'),
  lastReadMessageId: z.string().nullable(),
  subscription: subscriptionViewSchema
    .nullable()
    .describe('Your mute on this chat while it applies; null when none'),
  unread: z.number().int(),
  lastMessage: chatLastMessageSchema.nullable(),
});
export const ChatsPage = paginated(ChatListItem);

export const ChatListQuery = PageQuery.extend({
  requests: z
    .stringbool()
    .optional()
    .describe(
      '`true` for only the pending message requests to you, `false` for everything else; omit for every chat',
    ),
}).strict();

export const ChatUnreadSummary = chatUnreadSummarySchema;
export const ChatLiveEvent = chatLiveEventSchema;

export const MessageQueueEntry = z.object({
  message: MessageView,
  flags: z.array(MessageFlag),
  chat: Chat,
  participantIds: z.array(z.string()),
});

export const MessageQueue = z.object({
  entries: z.array(MessageQueueEntry),
});

const MessageBody = z.string().trim().min(1).max(10_000);
const Attachments = z
  .array(idSchema)
  .max(10)
  .default([])
  .describe('Up to 10 finalized images you uploaded through `requestMemberUpload`');

export const StartDirectChat = z
  .object({
    communityId: idSchema,
    orgUserId: idSchema.describe('The person to talk to'),
    body: MessageBody.nullable().describe(
      'The first message. Null opens the chat without one; a new chat that starts as a message request needs one, and attachments need one.',
    ),
    assetIds: Attachments,
  })
  .strict();

export const StartGroupChat = z
  .object({
    communityId: idSchema,
    orgUserIds: z
      .array(idSchema)
      .min(2)
      .max(99)
      .describe(
        "The people to add besides you. The chat may not exceed the community's group size.",
      ),
  })
  .strict();

export const SendMessage = z
  .object({
    body: MessageBody,
    replyToId: idSchema
      .nullable()
      .default(null)
      .describe('A message in the same chat this one answers'),
    assetIds: Attachments,
    clientId: z
      .uuid()
      .optional()
      .describe(
        'Your id for this send. Sending again with the same id returns the message already sent.',
      ),
  })
  .strict();

export const EditMessage = z.object({ body: MessageBody }).strict();
export const MarkRead = z
  .object({ messageId: idSchema.describe('The newest message you have read in this chat') })
  .strict();
export const OrgUserBody = z.object({ orgUserId: idSchema }).strict();
export const ResolveMessageFlags = z
  .object({
    resolution: messageFlagResolutionSchema
      .extract(['dismissed'])
      .describe(
        '`dismissed` closes the open flags and leaves the message up. Deleting the message or locking the chat resolves its flags as `deleted` or `locked` instead.',
      ),
  })
  .strict();

export const ChatIdParam = z.object({ chatId: z.string() });
export const MessageIdParam = z.object({ messageId: z.string() });
export const CommunityParam = z.object({ communityId: z.string() });
export const BlockParam = z.object({ communityId: z.string(), orgUserId: z.string() });
export const DirectChatParam = z.object({ communityId: z.string(), orgUserId: z.string() });
