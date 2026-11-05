import { and, asc, desc, eq, gt, inArray, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type {
  ChatInboxRow,
  ChatListQuery,
  ChatMemberStates,
  ChatRepository,
  ChatUnread,
  ChatUnreadSummary,
  FeedQuery,
  MessageReactions,
  PageQuery,
  ReactionChange,
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
  subscriptions,
} from "../schema/index.js";
import { translateDbErrors } from "./pg-errors.js";
import { insertedRow } from "./inserted-row.js";

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
    clientId: row.clientId,
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
    query: ChatListQuery,
  ): Promise<Page<ChatInboxRow>> {
    const request = this.requestTo(orgUserId);
    const mine = and(
      eq(chatUsers.orgId, orgId),
      eq(chatUsers.communityId, communityId),
      eq(chatUsers.orgUserId, orgUserId),
      isNull(chatUsers.leftAt),
      query.requests === undefined ? undefined : query.requests ? request : sql`not ${request}`,
    );
    const rows = await this.inbox(orgUserId, mine, query);
    const [{ total } = { total: 0 }] = await this.db
      .select({ total: sql<number>`cast(count(*) as int)` })
      .from(chatUsers)
      .innerJoin(chats, and(eq(chats.orgId, chatUsers.orgId), eq(chats.id, chatUsers.chatId)))
      .where(mine);
    const page = { total, page: query.page, pageSize: query.pageSize };
    return { rows: await this.withParticipants(orgId, rows), ...page };
  }

  async inboxRow(orgId: string, chatId: string, orgUserId: string): Promise<ChatInboxRow | null> {
    const rows = await this.inbox(
      orgUserId,
      and(
        eq(chatUsers.orgId, orgId),
        eq(chatUsers.chatId, chatId),
        eq(chatUsers.orgUserId, orgUserId),
        isNull(chatUsers.leftAt),
      ),
    );
    const [row] = await this.withParticipants(orgId, rows);
    return row ?? null;
  }

  async activeParticipants(orgId: string, chatId: string): Promise<string[]> {
    const rows = await this.db
      .select({ orgUserId: chatUsers.orgUserId })
      .from(chatUsers)
      .where(
        and(eq(chatUsers.orgId, orgId), eq(chatUsers.chatId, chatId), isNull(chatUsers.leftAt)),
      )
      .orderBy(asc(chatUsers.orgUserId));
    return rows.map((row) => row.orgUserId);
  }

  async unreadSummary(
    orgId: string,
    communityId: string,
    orgUserId: string,
    at: Date,
  ): Promise<ChatUnreadSummary> {
    const [states] = await this.memberStates(orgId, communityId, [orgUserId], at);
    return states?.unread ?? { unread: 0, requests: 0 };
  }

  async memberStates(
    orgId: string,
    communityId: string,
    orgUserIds: string[],
    at: Date,
  ): Promise<ChatMemberStates[]> {
    const ids = [...new Set(orgUserIds)];
    if (ids.length === 0) {
      return [];
    }
    const rows = await this.db
      .select({
        orgUserId: chatUsers.orgUserId,
        chatId: chatUsers.chatId,
        lastReadMessageId: chatUsers.lastReadMessageId,
        kind: chats.kind,
        status: chats.status,
        createdBy: chats.createdBy,
        state: subscriptions.state,
        mutedUntil: subscriptions.mutedUntil,
        unread: this.unreadCount(chatUsers.orgUserId),
      })
      .from(chatUsers)
      .innerJoin(chats, and(eq(chats.orgId, chatUsers.orgId), eq(chats.id, chatUsers.chatId)))
      .leftJoin(
        subscriptions,
        and(
          eq(subscriptions.orgId, chatUsers.orgId),
          eq(subscriptions.orgUserId, chatUsers.orgUserId),
          eq(subscriptions.itemType, "chat"),
          eq(subscriptions.itemId, chatUsers.chatId),
        ),
      )
      .where(
        and(
          eq(chatUsers.orgId, orgId),
          eq(chatUsers.communityId, communityId),
          inArray(chatUsers.orgUserId, ids),
          isNull(chatUsers.leftAt),
        ),
      )
      .orderBy(asc(chatUsers.orgUserId), asc(chatUsers.chatId));
    const byMember = new Map<string, ChatMemberStates>(
      ids.map((id) => [id, { orgUserId: id, unread: { unread: 0, requests: 0 }, chats: [] }]),
    );
    for (const row of rows) {
      const entry = byMember.get(row.orgUserId)!;
      const lapsed =
        row.state === "muted" &&
        row.mutedUntil !== null &&
        row.mutedUntil.getTime() <= at.getTime();
      const subscription =
        row.state !== null && !lapsed ? { state: row.state, mutedUntil: row.mutedUntil } : null;
      const request =
        row.kind === "direct" && row.status === "pending" && row.createdBy !== row.orgUserId;
      if (request) {
        entry.unread.requests += 1;
        entry.unread.unread += 1;
      } else if (subscription?.state !== "muted") {
        entry.unread.unread += row.unread;
      }
      entry.chats.push({
        chatId: row.chatId,
        unread: row.unread,
        lastReadMessageId: row.lastReadMessageId,
        subscription,
      });
    }
    return [...byMember.values()];
  }

  async findByClientId(
    orgId: string,
    chatId: string,
    orgUserId: string,
    clientId: string,
  ): Promise<Message | null> {
    const [row] = await this.db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.orgId, orgId),
          eq(messages.chatId, chatId),
          eq(messages.orgUserId, orgUserId),
          eq(messages.clientId, clientId),
        ),
      )
      .limit(1);
    return row ? toMessage(row) : null;
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
  ): Promise<boolean> {
    const rows = await this.db
      .update(chatUsers)
      .set({ lastReadMessageId: messageId, updatedAt: new Date() })
      .where(
        and(
          eq(chatUsers.orgId, orgId),
          eq(chatUsers.chatId, chatId),
          eq(chatUsers.orgUserId, orgUserId),
          sql`(
            ${chatUsers.lastReadMessageId} is null
            or not exists (
              select 1 from messages cur
              where cur.org_id = ${chatUsers.orgId} and cur.id = ${chatUsers.lastReadMessageId}
            )
            or exists (
              select 1
              from messages target
              join messages cur on cur.org_id = target.org_id
              where target.org_id = ${chatUsers.orgId}
                and target.id = ${messageId}
                and cur.id = ${chatUsers.lastReadMessageId}
                and (target.created_at, target.id) > (cur.created_at, cur.id)
            )
          )`,
        ),
      )
      .returning({ orgUserId: chatUsers.orgUserId });
    return rows.length > 0;
  }

  async unreadFor(orgId: string, chatId: string, orgUserId: string): Promise<ChatUnread> {
    const readUpTo = sql`coalesce((
      select lr.created_at
      from chat_users cu
      join messages lr on lr.org_id = cu.org_id and lr.id = cu.last_read_message_id
      where cu.org_id = ${orgId}
        and cu.chat_id = ${chatId}
        and cu.org_user_id = ${orgUserId}
    ), '-infinity'::timestamptz)`;
    const [row] = await this.db
      .select({
        count: sql<number>`cast(count(*) over () as int)`,
        id: messages.id,
        orgUserId: messages.orgUserId,
        body: messages.body,
      })
      .from(messages)
      .where(
        and(
          eq(messages.orgId, orgId),
          eq(messages.chatId, chatId),
          ne(messages.orgUserId, orgUserId),
          isNull(messages.deletedAt),
          gt(messages.createdAt, readUpTo),
        ),
      )
      .orderBy(desc(messages.createdAt), desc(messages.id))
      .limit(1);
    return row
      ? {
          count: row.count,
          latest: { messageId: row.id, senderOrgUserId: row.orgUserId, body: row.body },
        }
      : { count: 0, latest: null };
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
        clientId: message.clientId,
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
  ): Promise<ReactionChange> {
    if (emoji === null) {
      const removed = await this.db
        .delete(messageReactions)
        .where(
          and(
            eq(messageReactions.orgId, orgId),
            eq(messageReactions.messageId, messageId),
            eq(messageReactions.orgUserId, orgUserId),
          ),
        )
        .returning({ orgUserId: messageReactions.orgUserId });
      return { inserted: false, changed: removed.length > 0 };
    }
    const [row] = await this.db
      .insert(messageReactions)
      .values({ orgId, communityId, messageId, orgUserId, emoji })
      .onConflictDoUpdate({
        target: [messageReactions.orgId, messageReactions.messageId, messageReactions.orgUserId],
        set: { emoji, updatedAt: new Date() },
        setWhere: sql`${messageReactions.emoji} is distinct from excluded.emoji`,
      })
      .returning({ inserted: insertedRow });
    return { inserted: row?.inserted === true, changed: row !== undefined };
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
    return [...new Set(rows.map((row) => (row.blocker === orgUserId ? row.blocked : row.blocker)))];
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

  async listOpenFlags(orgId: string, communityId: string, limit?: number): Promise<MessageFlag[]> {
    const query = this.db
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
    const rows = limit === undefined ? await query : await query.limit(limit);
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

  private requestTo(orgUserId: string): SQL {
    return sql`(${chats.kind} = 'direct' and ${chats.status} = 'pending' and ${chats.createdBy} is distinct from ${orgUserId})`;
  }

  private unreadCount(orgUserId: string | typeof chatUsers.orgUserId) {
    return sql<number>`cast((
      select count(*)
      from messages m
      where m.org_id = ${chatUsers.orgId}
        and m.chat_id = ${chatUsers.chatId}
        and m.org_user_id <> ${orgUserId}
        and m.deleted_at is null
        and (
          ${chatUsers.lastReadMessageId} is null
          or m.created_at > coalesce((
            select lr.created_at
            from messages lr
            where lr.org_id = ${chatUsers.orgId}
              and lr.id = ${chatUsers.lastReadMessageId}
          ), '-infinity'::timestamptz)
        )
    ) as int)`;
  }

  private async inbox(
    orgUserId: string,
    where: SQL | undefined,
    query?: PageQuery,
  ): Promise<Omit<ChatInboxRow, "participantIds">[]> {
    const latest = this.db
      .select({
        id: messages.id,
        orgUserId: messages.orgUserId,
        body: messages.body,
        createdAt: messages.createdAt,
        deletedAt: messages.deletedAt,
      })
      .from(messages)
      .where(and(eq(messages.orgId, chats.orgId), eq(messages.chatId, chats.id)))
      .orderBy(desc(messages.createdAt), desc(messages.id))
      .limit(1)
      .as("last_message");
    const select = this.db
      .select({
        chat: chats,
        lastReadMessageId: chatUsers.lastReadMessageId,
        unread: this.unreadCount(orgUserId),
        lastId: latest.id,
        lastOrgUserId: latest.orgUserId,
        lastBody: latest.body,
        lastCreatedAt: latest.createdAt,
        lastDeletedAt: latest.deletedAt,
      })
      .from(chatUsers)
      .innerJoin(chats, and(eq(chats.orgId, chatUsers.orgId), eq(chats.id, chatUsers.chatId)))
      .leftJoinLateral(latest, sql`true`)
      .where(where)
      .orderBy(desc(chats.updatedAt), desc(chats.id));
    const rows = query
      ? await select.limit(query.pageSize).offset((query.page - 1) * query.pageSize)
      : await select.limit(1);
    return rows.map((row) => ({
      chat: toChat(row.chat),
      lastReadMessageId: row.lastReadMessageId,
      unread: row.unread,
      lastMessage:
        row.lastId !== null && row.lastOrgUserId !== null && row.lastCreatedAt !== null
          ? {
              id: row.lastId,
              orgUserId: row.lastOrgUserId,
              body: row.lastBody ?? "",
              createdAt: row.lastCreatedAt,
              deletedAt: row.lastDeletedAt,
            }
          : null,
    }));
  }

  private async withParticipants(
    orgId: string,
    rows: Omit<ChatInboxRow, "participantIds">[],
  ): Promise<ChatInboxRow[]> {
    if (rows.length === 0) {
      return [];
    }
    const people = await this.db
      .select()
      .from(chatUsers)
      .where(
        and(
          eq(chatUsers.orgId, orgId),
          inArray(
            chatUsers.chatId,
            rows.map((row) => row.chat.id),
          ),
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
      ...row,
      participantIds: (byChat.get(row.chat.id) ?? []).sort(),
    }));
  }

  private async touch(orgId: string, chatId: string): Promise<void> {
    await this.db
      .update(chats)
      .set({ updatedAt: new Date() })
      .where(and(eq(chats.orgId, orgId), eq(chats.id, chatId)));
  }
}

translateDbErrors(DrizzleChatRepository);
