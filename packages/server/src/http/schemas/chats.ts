import { z } from 'zod';
import {
  chatLastMessageSchema,
  chatSchema,
  messageFlagResolutionSchema,
  messageFlagSchema,
  messageViewSchema,
} from '@headless-lms/core/schemas';
import { paginated } from './shared.js';

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

export const StartDirectChat = z
  .object({
    communityId: z.string(),
    orgUserId: z.string(),
    body: z.string().trim().min(1).max(10_000).nullable(),
    assetIds: z.array(z.string()).default([]),
  })
  .strict();

export const StartGroupChat = z
  .object({
    communityId: z.string(),
    orgUserIds: z.array(z.string()).min(2),
  })
  .strict();

export const SendMessage = z
  .object({
    body: z.string().trim().min(1).max(10_000),
    replyToId: z.string().nullable().default(null),
    assetIds: z.array(z.string()).default([]),
  })
  .strict();

export const EditMessage = z.object({ body: z.string().min(1) }).strict();
export const MarkRead = z.object({ messageId: z.string() }).strict();
export const MuteChat = z
  .object({ until: z.iso.datetime({ offset: true }).pipe(z.coerce.date()).optional() })
  .strict();
export const OrgUserBody = z.object({ orgUserId: z.string() }).strict();
export const ResolveMessageFlags = z
  .object({ resolution: messageFlagResolutionSchema.extract(['dismissed']) })
  .strict();

export const ChatIdParam = z.object({ chatId: z.string() });
export const MessageIdParam = z.object({ messageId: z.string() });
export const CommunityParam = z.object({ communityId: z.string() });
export const BlockParam = z.object({ communityId: z.string(), orgUserId: z.string() });
