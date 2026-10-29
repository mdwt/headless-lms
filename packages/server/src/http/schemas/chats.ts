import { z } from 'zod';
import {
  chatLastMessageSchema,
  chatSchema,
  idSchema,
  messageFlagResolutionSchema,
  messageFlagSchema,
  messageViewSchema,
} from '@headless-lms/core/schemas';
import { DateTimeInput, paginated } from './shared.js';

export const Chat = chatSchema;
export const MessageFlag = messageFlagSchema;
export const MessageView = messageViewSchema;
export const MessagesPage = paginated(MessageView);

export const ChatListItem = z.object({
  chat: Chat,
  participantIds: z.array(z.string()),
  lastReadMessageId: z.string().nullable(),
  muted: z.boolean(),
  mutedUntil: z.coerce.date().nullable(),
  unread: z.number().int(),
  lastMessage: chatLastMessageSchema.nullable(),
});
export const ChatsPage = paginated(ChatListItem);

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
  })
  .strict();

export const EditMessage = z.object({ body: MessageBody }).strict();
export const MarkRead = z
  .object({ messageId: idSchema.describe('The newest message you have read in this chat') })
  .strict();
export const MuteChat = z
  .object({
    until: DateTimeInput.optional().describe('When the mute ends. Omit to mute until you unmute'),
  })
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
