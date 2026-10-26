import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type {
  ChatListItem,
  ChatRepository,
  FeedQuery,
  MessageReactions,
} from "@headless-lms/core/discussion";
import type {
  Chat,
  ChatUser,
  Logger,
  Message,
  MessageFlag,
  MessageFlagResolution,
  Page,
  ReactionEmoji,
} from "@headless-lms/core/types";
import { noopLogger } from "@headless-lms/core/shared/logger";
import {
  blockedUsers,
  chatUsers,
  chats,
  messageAttachments,
  messageFlags,
  messageReactions,
  messages,
} from "../schema/index.js";
import { translateDbErrors } from "./pg-errors.js";

type ChatRow = typeof chats.$inferSelect;
type ChatUserRow = typeof chatUsers.$inferSelect;
type MessageRow = typeof messages.$inferSelect;
type FlagRow = typeof messageFlags.$inferSelect;

function toChat(row: ChatRow): Chat {
  return {
    orgId: row.orgId,
    id: row.id,
    communityId: row.communityId,
    kind: row.kind,
    status: row.status,
    createdBy: row.createdBy,
    lockedAt: row.lockedAt,
    lockedBy: row.lockedBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toChatUser(row: ChatUserRow): ChatUser {
  return {
    orgId: row.orgId,
    communityId: row.communityId,
    chatId: row.chatId,
    orgUserId: row.orgUserId,
    joinedAt: row.joinedAt,
    leftAt: row.leftAt,
    lastReadMessageId: row.lastReadMessageId,
    muted: row.muted,
    mutedUntil: row.mutedUntil,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toMessage(row: MessageRow): Message {
  return {
    orgId: row.orgId,
    id: row.id,
    communityId: row.communityId,
    chatId: row.chatId,
    orgUserId: row.orgUserId,
    body: row.body,
    replyToId: row.replyToId,
    editedAt: row.editedAt,
    deletedAt: row.deletedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toFlag(row: FlagRow): MessageFlag {
  return {
    orgId: row.orgId,
    id: row.id,
    communityId: row.communityId,
    messageId: row.messageId,
    orgUserId: row.orgUserId,
    reason: row.reason,
    resolvedAt: row.resolvedAt,
    resolution: row.resolution,
    resolvedBy: row.resolvedBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class DrizzleChatRepository implements ChatRepository {
  constructor(
    private readonly db: NodePgDatabase,
    private readonly logger: Logger = noopLogger,
  ) {}

  async lockDirectPair(
    orgId: string,
    communityId: string,
    orgUserId: string,
    otherOrgUserId: string,
  ): Promise<void> {
    const [lo, hi] = [orgUserId, otherOrgUserId].sort();
    await this.db.execute(sql`
      select pg_advisory_xact_lock(
        hashtext(${`${orgId}:${communityId}`}),
        hashtext(${`${lo}:${hi}`})
      )
    `);
  }

  async findDirect(
    orgId: string,
    communityId: string,
    orgUserId: string,
    otherOrgUserId: string,
  ): Promise<Chat | null> {
    const [row] = await this.db
      .select()
      .from(chats)
      .where(
        and(
          eq(chats.orgId, orgId),
          eq(chats.communityId, communityId),
          eq(chats.kind, "direct"),
          sql`exists (
            select 1 from chat_users cu
            where cu.org_id = ${chats.orgId}
              and cu.chat_id = ${chats.id}
              and cu.org_user_id = ${orgUserId}
          )`,
          sql`exists (
            select 1 from chat_users cu
            where cu.org_id = ${chats.orgId}
              and cu.chat_id = ${chats.id}
              and cu.org_user_id = ${otherOrgUserId}
          )`,
          sql`(
            select count(*) from chat_users cu
            where cu.org_id = ${chats.orgId} and cu.chat_id = ${chats.id}
          ) = 2`,
        ),
      )
      .limit(1);
    return row ? toChat(row) : null;
  }

  async insertChat(orgId: string, chat: Chat): Promise<Chat> {
    const [row] = await this.db
      .insert(chats)
      .values({
        orgId,
        id: chat.id,
        communityId: chat.communityId,
        kind: chat.kind,
        status: chat.status,
        createdBy: chat.createdBy,
        lockedAt: chat.lockedAt,
        lockedBy: chat.lockedBy,
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt,
      })
      .returning();
    this.logger.debug("chat inserted", { orgId, chatId: chat.id });
    return toChat(row!);
  }

  async updateChat(
    orgId: string,
    id: string,
    patch: Partial<Pick<Chat, "status" | "lockedAt" | "lockedBy">>,
  ): Promise<Chat | null> {
    const [row] = await this.db
      .update(chats)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(chats.orgId, orgId), eq(chats.id, id)))
      .returning();
    return row ? toChat(row) : null;
  }

  async findChat(orgId: string, id: string): Promise<Chat | null> {
    const [row] = await this.db
      .select()
      .from(chats)
      .where(and(eq(chats.orgId, orgId), eq(chats.id, id)))
      .limit(1);
    return row ? toChat(row) : null;
  }

  async listForUser(
    orgId: string,
    communityId: string,
    orgUserId: string,
  ): Promise<ChatListItem[]> {
    const unread = sql<number>`cast((
      select count(*)
      from messages m
      where m.org_id = ${chats.orgId}
        and m.chat_id = ${chats.id}
        and m.org_user_id <> ${orgUserId}
        and (
          ${chatUsers.lastReadMessageId} is null
          or m.created_at > coalesce((
            select lr.created_at
            from messages lr
            where lr.org_id = ${chats.orgId}
              and lr.id = ${chatUsers.lastReadMessageId}
          ), '-infinity'::timestamptz)
        )
    ) as int)`;
    const rows = await this.db
      .select({
        chat: chats,
        lastReadMessageId: chatUsers.lastReadMessageId,
        muted: chatUsers.muted,
        mutedUntil: chatUsers.mutedUntil,
        unread,
      })
      .from(chatUsers)
      .innerJoin(chats, and(eq(chats.orgId, chatUsers.orgId), eq(chats.id, chatUsers.chatId)))
      .where(
        and(
          eq(chatUsers.orgId, orgId),
          eq(chatUsers.communityId, communityId),
          eq(chatUsers.orgUserId, orgUserId),
          isNull(chatUsers.leftAt),
        ),
      )
      .orderBy(desc(chats.updatedAt), desc(chats.id));
    if (rows.length === 0) {
      return [];
    }
    const ids = rows.map((row) => row.chat.id);
    const [people, latest] = await Promise.all([
      this.db
        .select()
        .from(chatUsers)
        .where(
          and(
            eq(chatUsers.orgId, orgId),
            inArray(chatUsers.chatId, ids),
            isNull(chatUsers.leftAt),
          ),
        ),
      this.db
        .selectDistinctOn([messages.chatId], {
          chatId: messages.chatId,
          id: messages.id,
          orgUserId: messages.orgUserId,
          body: messages.body,
          createdAt: messages.createdAt,
          deletedAt: messages.deletedAt,
        })
        .from(messages)
        .where(and(eq(messages.orgId, orgId), inArray(messages.chatId, ids)))
        .orderBy(asc(messages.chatId), desc(messages.createdAt), desc(messages.id)),
    ]);
    const byChat = new Map<string, string[]>();
    for (const person of people) {
      const list = byChat.get(person.chatId) ?? [];
      list.push(person.orgUserId);
      byChat.set(person.chatId, list);
    }
    const lastByChat = new Map(
      latest.map(({ chatId, ...message }) => [chatId, message] as const),
    );
    return rows.map((row) => ({
      chat: toChat(row.chat),
      participantIds: (byChat.get(row.chat.id) ?? []).sort(),
      lastReadMessageId: row.lastReadMessageId,
      muted: row.muted,
      mutedUntil: row.mutedUntil,
      unread: row.unread,
      lastMessage: lastByChat.get(row.chat.id) ?? null,
    }));
  }

  async participants(orgId: string, chatId: string): Promise<ChatUser[]> {
    const rows = await this.db
      .select()
      .from(chatUsers)
      .where(and(eq(chatUsers.orgId, orgId), eq(chatUsers.chatId, chatId)))
      .orderBy(asc(chatUsers.orgUserId));
    return rows.map(toChatUser);
  }

  async join(orgId: string, user: ChatUser): Promise<void> {
    await this.db
      .insert(chatUsers)
      .values({
        orgId,
        communityId: user.communityId,
        chatId: user.chatId,
        orgUserId: user.orgUserId,
        joinedAt: user.joinedAt,
        leftAt: user.leftAt,
        lastReadMessageId: user.lastReadMessageId,
        muted: user.muted,
        mutedUntil: user.mutedUntil,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      })
      .onConflictDoUpdate({
        target: [chatUsers.orgId, chatUsers.chatId, chatUsers.orgUserId],
        set: { leftAt: null, updatedAt: new Date() },
      });
    await this.touch(orgId, user.chatId);
  }

  async markLeft(orgId: string, chatId: string, orgUserId: string, leftAt: Date): Promise<void> {
    await this.db
      .update(chatUsers)
      .set({ leftAt, updatedAt: new Date() })
      .where(
        and(
          eq(chatUsers.orgId, orgId),
          eq(chatUsers.chatId, chatId),
          eq(chatUsers.orgUserId, orgUserId),
        ),
      );
    await this.touch(orgId, chatId);
  }

  async setRead(
    orgId: string,
    chatId: string,
    orgUserId: string,
    messageId: string,
  ): Promise<void> {
    await this.db
      .update(chatUsers)
      .set({ lastReadMessageId: messageId, updatedAt: new Date() })
      .where(
        and(
          eq(chatUsers.orgId, orgId),
          eq(chatUsers.chatId, chatId),
          eq(chatUsers.orgUserId, orgUserId),
        ),
      );
  }

  async setMuted(
    orgId: string,
    chatId: string,
    orgUserId: string,
    muted: boolean,
    mutedUntil: Date | null,
  ): Promise<void> {
    await this.db
      .update(chatUsers)
      .set({ muted, mutedUntil, updatedAt: new Date() })
      .where(
        and(
          eq(chatUsers.orgId, orgId),
          eq(chatUsers.chatId, chatId),
          eq(chatUsers.orgUserId, orgUserId),
        ),
      );
  }

  async insertMessage(orgId: string, message: Message): Promise<Message> {
    const [row] = await this.db
      .insert(messages)
      .values({
        orgId,
        id: message.id,
        communityId: message.communityId,
        chatId: message.chatId,
        orgUserId: message.orgUserId,
        body: message.body,
        replyToId: message.replyToId,
        editedAt: message.editedAt,
        deletedAt: message.deletedAt,
        createdAt: message.createdAt,
        updatedAt: message.updatedAt,
      })
      .returning();
    await this.touch(orgId, message.chatId);
    this.logger.debug("message inserted", { orgId, messageId: message.id });
    return toMessage(row!);
  }

  async updateMessage(
    orgId: string,
    id: string,
    patch: Partial<Pick<Message, "body" | "editedAt" | "deletedAt">>,
  ): Promise<Message | null> {
    const [row] = await this.db
      .update(messages)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(messages.orgId, orgId), eq(messages.id, id)))
      .returning();
    if (!row) {
      return null;
    }
    await this.touch(orgId, row.chatId);
    return toMessage(row);
  }

  async findMessage(orgId: string, id: string): Promise<Message | null> {
    const [row] = await this.db
      .select()
      .from(messages)
      .where(and(eq(messages.orgId, orgId), eq(messages.id, id)))
      .limit(1);
    return row ? toMessage(row) : null;
  }

  async listMessages(
    orgId: string,
    chatId: string,
    query: Pick<FeedQuery, "page" | "pageSize">,
  ): Promise<Page<Message>> {
    const where = and(eq(messages.orgId, orgId), eq(messages.chatId, chatId));
    const rows = await this.db
      .select()
      .from(messages)
      .where(where)
      .orderBy(desc(messages.createdAt), desc(messages.id))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);
    const [{ total } = { total: 0 }] = await this.db
      .select({ total: sql<number>`cast(count(*) as int)` })
      .from(messages)
      .where(where);
    return { rows: rows.map(toMessage), total, page: query.page, pageSize: query.pageSize };
  }

  async attach(
    orgId: string,
    communityId: string,
    messageId: string,
    assetIds: string[],
  ): Promise<void> {
    if (assetIds.length === 0) {
      return;
    }
    await this.db.insert(messageAttachments).values(
      assetIds.map((assetId, seq) => ({
        orgId,
        communityId,
        messageId,
        assetId,
        seq,
      })),
    );
  }

  async attachmentsOf(orgId: string, messageIds: string[]): Promise<Record<string, string[]>> {
    if (messageIds.length === 0) {
      return {};
    }
    const rows = await this.db
      .select({ messageId: messageAttachments.messageId, assetId: messageAttachments.assetId })
      .from(messageAttachments)
      .where(
        and(
          eq(messageAttachments.orgId, orgId),
          inArray(messageAttachments.messageId, [...new Set(messageIds)]),
        ),
      )
      .orderBy(asc(messageAttachments.messageId), asc(messageAttachments.seq));
    const byMessage: Record<string, string[]> = {};
    for (const row of rows) {
      (byMessage[row.messageId] ??= []).push(row.assetId);
    }
    return byMessage;
  }

  async setReaction(
    orgId: string,
    communityId: string,
    messageId: string,
    orgUserId: string,
    emoji: ReactionEmoji | null,
  ): Promise<void> {
    if (emoji === null) {
      await this.db
        .delete(messageReactions)
        .where(
          and(
            eq(messageReactions.orgId, orgId),
            eq(messageReactions.messageId, messageId),
            eq(messageReactions.orgUserId, orgUserId),
          ),
        );
      return;
    }
    await this.db
      .insert(messageReactions)
      .values({ orgId, communityId, messageId, orgUserId, emoji })
      .onConflictDoUpdate({
        target: [messageReactions.orgId, messageReactions.messageId, messageReactions.orgUserId],
        set: { emoji, updatedAt: new Date() },
      });
  }

  async reactionsOf(
    orgId: string,
    messageIds: string[],
    viewerId: string,
  ): Promise<Record<string, MessageReactions>> {
    if (messageIds.length === 0) {
      return {};
    }
    const rows = await this.db
      .select({
        messageId: messageReactions.messageId,
        emoji: messageReactions.emoji,
        count: sql<number>`cast(count(*) as int)`,
        mine: sql<boolean>`bool_or(${messageReactions.orgUserId} = ${viewerId})`,
      })
      .from(messageReactions)
      .where(
        and(
          eq(messageReactions.orgId, orgId),
          inArray(messageReactions.messageId, [...new Set(messageIds)]),
        ),
      )
      .groupBy(messageReactions.messageId, messageReactions.emoji);
    const byMessage: Record<string, MessageReactions> = {};
    for (const row of rows) {
      const entry = (byMessage[row.messageId] ??= { reactions: {} });
      entry.reactions[row.emoji] = row.count;
      if (row.mine) {
        entry.viewerReaction = row.emoji;
      }
    }
    return byMessage;
  }

  async block(
    orgId: string,
    communityId: string,
    blockerOrgUserId: string,
    blockedOrgUserId: string,
  ): Promise<void> {
    await this.db
      .insert(blockedUsers)
      .values({ orgId, communityId, blockerOrgUserId, blockedOrgUserId })
      .onConflictDoNothing();
  }

  async unblock(
    orgId: string,
    communityId: string,
    blockerOrgUserId: string,
    blockedOrgUserId: string,
  ): Promise<void> {
    await this.db
      .delete(blockedUsers)
      .where(
        and(
          eq(blockedUsers.orgId, orgId),
          eq(blockedUsers.communityId, communityId),
          eq(blockedUsers.blockerOrgUserId, blockerOrgUserId),
          eq(blockedUsers.blockedOrgUserId, blockedOrgUserId),
        ),
      );
  }

  async isBlocked(orgId: string, communityId: string, a: string, b: string): Promise<boolean> {
    const [row] = await this.db
      .select({ blockerOrgUserId: blockedUsers.blockerOrgUserId })
      .from(blockedUsers)
      .where(
        and(
          eq(blockedUsers.orgId, orgId),
          eq(blockedUsers.communityId, communityId),
          or(
            and(eq(blockedUsers.blockerOrgUserId, a), eq(blockedUsers.blockedOrgUserId, b)),
            and(eq(blockedUsers.blockerOrgUserId, b), eq(blockedUsers.blockedOrgUserId, a)),
          ),
        ),
      )
      .limit(1);
    return Boolean(row);
  }

  async anyBlockedAmong(
    orgId: string,
    communityId: string,
    orgUserIds: string[],
  ): Promise<boolean> {
    if (orgUserIds.length < 2) {
      return false;
    }
    const [row] = await this.db
      .select({ blockerOrgUserId: blockedUsers.blockerOrgUserId })
      .from(blockedUsers)
      .where(
        and(
          eq(blockedUsers.orgId, orgId),
          eq(blockedUsers.communityId, communityId),
          inArray(blockedUsers.blockerOrgUserId, orgUserIds),
          inArray(blockedUsers.blockedOrgUserId, orgUserIds),
        ),
      )
      .limit(1);
    return Boolean(row);
  }

  async blockedWith(
    orgId: string,
    communityId: string,
    orgUserId: string,
    otherIds: string[],
  ): Promise<string[]> {
    if (otherIds.length === 0) {
      return [];
    }
    const rows = await this.db
      .select({
        blocker: blockedUsers.blockerOrgUserId,
        blocked: blockedUsers.blockedOrgUserId,
      })
      .from(blockedUsers)
      .where(
        and(
          eq(blockedUsers.orgId, orgId),
          eq(blockedUsers.communityId, communityId),
          or(
            and(
              eq(blockedUsers.blockerOrgUserId, orgUserId),
              inArray(blockedUsers.blockedOrgUserId, otherIds),
            ),
            and(
              eq(blockedUsers.blockedOrgUserId, orgUserId),
              inArray(blockedUsers.blockerOrgUserId, otherIds),
            ),
          ),
        ),
      );
    return [
      ...new Set(rows.map((row) => (row.blocker === orgUserId ? row.blocked : row.blocker))),
    ];
  }

  async insertFlag(orgId: string, flag: MessageFlag): Promise<MessageFlag | null> {
    const [row] = await this.db
      .insert(messageFlags)
      .values({
        orgId,
        id: flag.id,
        communityId: flag.communityId,
        messageId: flag.messageId,
        orgUserId: flag.orgUserId,
        reason: flag.reason,
        resolvedAt: flag.resolvedAt,
        resolution: flag.resolution,
        resolvedBy: flag.resolvedBy,
        createdAt: flag.createdAt,
        updatedAt: flag.updatedAt,
      })
      .onConflictDoNothing()
      .returning();
    return row ? toFlag(row) : null;
  }

  async findFlag(orgId: string, messageId: string, orgUserId: string): Promise<MessageFlag | null> {
    const [row] = await this.db
      .select()
      .from(messageFlags)
      .where(
        and(
          eq(messageFlags.orgId, orgId),
          eq(messageFlags.messageId, messageId),
          eq(messageFlags.orgUserId, orgUserId),
        ),
      )
      .limit(1);
    return row ? toFlag(row) : null;
  }

  async listOpenFlags(orgId: string, communityId: string): Promise<MessageFlag[]> {
    const rows = await this.db
      .select()
      .from(messageFlags)
      .where(
        and(
          eq(messageFlags.orgId, orgId),
          eq(messageFlags.communityId, communityId),
          isNull(messageFlags.resolvedAt),
        ),
      )
      .orderBy(asc(messageFlags.createdAt), asc(messageFlags.id));
    return rows.map(toFlag);
  }

  async messagesByIds(orgId: string, ids: string[]): Promise<Message[]> {
    if (ids.length === 0) {
      return [];
    }
    const rows = await this.db
      .select()
      .from(messages)
      .where(and(eq(messages.orgId, orgId), inArray(messages.id, ids)))
      .orderBy(asc(messages.createdAt), asc(messages.id));
    return rows.map(toMessage);
  }

  async chatSummaries(
    orgId: string,
    chatIds: string[],
  ): Promise<{ chat: Chat; participantIds: string[] }[]> {
    if (chatIds.length === 0) {
      return [];
    }
    const rows = await this.db
      .select()
      .from(chats)
      .where(and(eq(chats.orgId, orgId), inArray(chats.id, chatIds)));
    const people = await this.db
      .select({ chatId: chatUsers.chatId, orgUserId: chatUsers.orgUserId })
      .from(chatUsers)
      .where(
        and(
          eq(chatUsers.orgId, orgId),
          inArray(chatUsers.chatId, chatIds),
          isNull(chatUsers.leftAt),
        ),
      );
    const byChat = new Map<string, string[]>();
    for (const person of people) {
      const list = byChat.get(person.chatId) ?? [];
      list.push(person.orgUserId);
      byChat.set(person.chatId, list);
    }
    return rows.map((row) => ({
      chat: toChat(row),
      participantIds: (byChat.get(row.id) ?? []).sort(),
    }));
  }

  async resolveOpenFlagsForChat(
    orgId: string,
    chatId: string,
    resolved: { resolvedAt: Date; resolvedBy: string; resolution: MessageFlagResolution },
  ): Promise<void> {
    const inChat = this.db
      .select({ id: messages.id })
      .from(messages)
      .where(and(eq(messages.orgId, orgId), eq(messages.chatId, chatId)));
    await this.db
      .update(messageFlags)
      .set({
        resolvedAt: resolved.resolvedAt,
        resolvedBy: resolved.resolvedBy,
        resolution: resolved.resolution,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(messageFlags.orgId, orgId),
          inArray(messageFlags.messageId, inChat),
          isNull(messageFlags.resolvedAt),
        ),
      );
  }

  async resolveFlags(
    orgId: string,
    messageId: string,
    resolved: { resolvedAt: Date; resolvedBy: string; resolution: MessageFlagResolution },
  ): Promise<void> {
    await this.db
      .update(messageFlags)
      .set({
        resolvedAt: resolved.resolvedAt,
        resolvedBy: resolved.resolvedBy,
        resolution: resolved.resolution,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(messageFlags.orgId, orgId),
          eq(messageFlags.messageId, messageId),
          isNull(messageFlags.resolvedAt),
        ),
      );
  }

  private async touch(orgId: string, chatId: string): Promise<void> {
    await this.db
      .update(chats)
      .set({ updatedAt: new Date() })
      .where(and(eq(chats.orgId, orgId), eq(chats.id, chatId)));
  }
}

translateDbErrors(DrizzleChatRepository);
