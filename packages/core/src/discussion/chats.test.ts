import { describe, expect, it } from 'vitest';
import {
  ConflictError,
  ForbiddenError,
  InvalidInputError,
  NotFoundError,
  UnavailableError,
} from '../shared/errors.js';
import type { Actor } from '../shared/actor.js';
import type { JsonValue, NewDomainEvent, PubSub } from '../shared/ports.js';
import type { DmSettings } from '../content/index.js';
import { actorWith } from '../organizations/index.js';
import type { AssetFiles, MemberImageReader } from '../assets/index.js';
import { createFileUrls } from '../assets/index.js';
import { ChatServiceImpl } from './chats.js';
import { activeSubscription } from './subscriptions.js';
import type {
  AuthorPermissionReader,
  ChatInboxRow,
  ChatListItem,
  ChatRepository,
  ChatUnitOfWork,
  CommunityAccess,
  MentionsRepository,
  SendMessageInput,
  SubscriptionsRepository,
} from './ports.js';
import type { Chat, ChatUser, Message, MessageFlag, Page, Subscription } from '../types/index.js';

function mentionStore() {
  const rows: { itemType: string; itemId: string; orgUserId: string; createdAt: Date }[] = [];
  const of = (itemType: string, itemId: string) =>
    rows.filter((row) => row.itemType === itemType && row.itemId === itemId);
  const repo: MentionsRepository = {
    async ofItem(_orgId, itemType, itemId) {
      return of(itemType, itemId).map((row) => row.orgUserId);
    },
    async forItems(_orgId, itemType, itemIds) {
      return Object.fromEntries(
        itemIds
          .map((itemId) => [itemId, of(itemType, itemId).map((row) => row.orgUserId)] as const)
          .filter(([, people]) => people.length > 0),
      );
    },
    async sync(_orgId, itemType, itemId, orgUserIds, at) {
      for (const row of of(itemType, itemId)) {
        if (!orgUserIds.includes(row.orgUserId)) {
          rows.splice(rows.indexOf(row), 1);
        }
      }
      const before = of(itemType, itemId).map((row) => row.orgUserId);
      const added = orgUserIds.filter((orgUserId) => !before.includes(orgUserId));
      rows.push(...added.map((orgUserId) => ({ itemType, itemId, orgUserId, createdAt: at })));
      return added;
    },
    async removeItem(_orgId, itemType, itemId) {
      for (const row of of(itemType, itemId)) {
        rows.splice(rows.indexOf(row), 1);
      }
    },
  };
  return { rows, repo };
}

function subscriptionStore() {
  const rows: Subscription[] = [];
  const same = (row: Subscription, orgUserId: string, itemType: string, itemId: string) =>
    row.orgUserId === orgUserId && row.itemType === itemType && row.itemId === itemId;
  const repo: SubscriptionsRepository = {
    async upsert(_orgId, subscription) {
      const index = rows.findIndex((row) =>
        same(row, subscription.orgUserId, subscription.itemType, subscription.itemId),
      );
      if (index >= 0) {
        rows[index] = {
          ...rows[index]!,
          state: subscription.state,
          mutedUntil: subscription.mutedUntil,
        };
        return;
      }
      rows.push({ ...subscription });
    },
    async remove(_orgId, orgUserId, itemType, itemId) {
      const index = rows.findIndex((row) => same(row, orgUserId, itemType, itemId));
      if (index >= 0) {
        rows.splice(index, 1);
      }
    },
    async forViewer(_orgId, orgUserId, itemType, itemIds) {
      return rows.filter(
        (row) =>
          row.orgUserId === orgUserId && row.itemType === itemType && itemIds.includes(row.itemId),
      );
    },
    async ofItem(_orgId, itemType, itemId) {
      return rows.filter((row) => row.itemType === itemType && row.itemId === itemId);
    },
    async followerIds(_orgId, postId) {
      return rows
        .filter(
          (row) => row.itemType === 'post' && row.itemId === postId && row.state === 'following',
        )
        .map((row) => row.orgUserId);
    },
    async mutedAmong(_orgId, itemType, itemId, orgUserIds, at) {
      return rows
        .filter(
          (row) =>
            row.itemType === itemType &&
            row.itemId === itemId &&
            row.state === 'muted' &&
            orgUserIds.includes(row.orgUserId) &&
            (row.mutedUntil === null || row.mutedUntil > at),
        )
        .map((row) => row.orgUserId);
    },
  };
  return { rows, repo };
}

const dmSettings: DmSettings = {
  enabled: true,
  memberToMember: true,
  memberToTeam: true,
  teamToAnyone: true,
  firstMessageIsRequest: true,
  groupChats: true,
  groupSize: 8,
};

const ORG = 'org-1';
const COMMUNITY = 'cmy_1';
const PAGE = { page: 1, pageSize: 100 };

const MODERATOR = { key: 'moderator', name: 'Moderator', team: true };
const ADMIN = { key: 'admin', name: 'Admin', team: true };

const member = actorWith({ id: 'ou_member', orgId: ORG });
const other = actorWith({ id: 'ou_other', orgId: ORG });
const third = actorWith({ id: 'ou_third', orgId: ORG });
const fourth = actorWith({ id: 'ou_fourth', orgId: ORG });
/** Moderates Autumn cohort (cmy_2) only: a plain member in Spring cohort. */
const moderator = actorWith({
  id: 'ou_mod',
  orgId: ORG,
  content: { cmy_2: ['communities:moderate'] },
  contentRoles: { cmy_2: MODERATOR },
});
/** Emma moderates Spring cohort (cmy_1) only, and holds nothing else. */
const emma = actorWith({
  id: 'ou_emma',
  orgId: ORG,
  content: { [COMMUNITY]: ['communities:moderate'] },
  contentRoles: { [COMMUNITY]: MODERATOR },
});
/** Holds the community permissions on the org: a member of every community. */
const staff = actorWith({
  id: 'ou_staff',
  orgId: ORG,
  org: ['communities:read', 'communities:moderate'],
  orgRole: ADMIN,
});
const outsider = actorWith({ id: 'ou_out', orgId: ORG });

const people = new Map<string, Actor>(
  [member, other, third, fourth, moderator, emma, staff, outsider].map((actor) => [
    actor.id,
    actor,
  ]),
);

function personOf(orgUserId: string): Actor {
  return people.get(orgUserId) ?? actorWith({ id: orgUserId, orgId: ORG });
}

const messageInput = (body: string): SendMessageInput => ({
  body,
  replyToId: null,
  assetIds: [],
});

function dataOf(event: NewDomainEvent): Record<string, unknown> {
  const data = event.data;
  if (data && typeof data === 'object') {
    return data as Record<string, unknown>;
  }
  return {};
}

const fileUrls = createFileUrls('https://api.test');

function harness(options?: {
  settings?: Partial<DmSettings> | null;
  members?: string[];
  images?: MemberImageReader & Partial<Pick<AssetFiles, 'signFile'>>;
  pubsub?: PubSub;
}) {
  const chats: Chat[] = [];
  const users: ChatUser[] = [];
  const messages: Message[] = [];
  const attachments: { messageId: string; assetIds: string[] }[] = [];
  const blocks: { communityId: string; blocker: string; blocked: string }[] = [];
  const flags: MessageFlag[] = [];
  const reactions: { messageId: string; orgUserId: string; emoji: string }[] = [];
  const calls: NewDomainEvent[][] = [];
  const members = new Set(
    options?.members ?? [member.id, other.id, third.id, fourth.id, moderator.id, emma.id],
  );
  const settings = options?.settings === null ? null : { ...dmSettings, ...options?.settings };

  const pair = (a: string, b: string) => [a, b].sort().join(':');
  const queries = { isBlocked: 0, blockedWith: 0, anyBlockedAmong: 0 };
  const race: { missClientId: boolean; joinAfterRead: ChatUser | null } = {
    missClientId: false,
    joinAfterRead: null,
  };
  const subscriptions = subscriptionStore();
  const newest = (a: Message, b: Message) =>
    b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1);
  const after = (a: Message, b: Message) =>
    a.createdAt.getTime() > b.createdAt.getTime() ||
    (a.createdAt.getTime() === b.createdAt.getTime() && a.id > b.id);
  const unreadOf = (chatId: string, orgUserId: string) => {
    const marker = users.find(
      (row) => row.chatId === chatId && row.orgUserId === orgUserId,
    )?.lastReadMessageId;
    const read = messages.find((row) => row.id === marker);
    return messages
      .filter(
        (row) =>
          row.chatId === chatId &&
          row.orgUserId !== orgUserId &&
          row.deletedAt === null &&
          (!read || row.createdAt.getTime() > read.createdAt.getTime()),
      )
      .sort(newest);
  };
  const isRequestTo = (chat: Chat, orgUserId: string) =>
    chat.kind === 'direct' && chat.status === 'pending' && chat.createdBy !== orgUserId;
  const activeIn = (chatId: string, orgUserId: string) =>
    users.some((user) => user.chatId === chatId && user.orgUserId === orgUserId && !user.leftAt);
  const inboxRowOf = (chat: Chat, orgUserId: string): ChatInboxRow => {
    const mine = users.find((user) => user.chatId === chat.id && user.orgUserId === orgUserId);
    const last = messages.filter((row) => row.chatId === chat.id).sort(newest)[0];
    return {
      chat: { ...chat },
      participantIds: users
        .filter((user) => user.chatId === chat.id && user.leftAt === null)
        .map((user) => user.orgUserId)
        .sort(),
      lastReadMessageId: mine?.lastReadMessageId ?? null,
      unread: unreadOf(chat.id, orgUserId).length,
      lastMessage: last
        ? {
            id: last.id,
            orgUserId: last.orgUserId,
            body: last.body,
            createdAt: last.createdAt,
            deletedAt: last.deletedAt,
          }
        : null,
    };
  };
  const statesOf = (communityId: string, orgUserId: string, at: Date) => {
    const mine = chats.filter(
      (chat) => chat.communityId === communityId && activeIn(chat.id, orgUserId),
    );
    let unread = 0;
    let requests = 0;
    const states = mine.map((chat) => {
      const count = unreadOf(chat.id, orgUserId).length;
      const subscription = activeSubscription(
        subscriptions.rows.find(
          (row) => row.orgUserId === orgUserId && row.itemType === 'chat' && row.itemId === chat.id,
        ),
        at,
      );
      if (isRequestTo(chat, orgUserId)) {
        requests += 1;
      } else if (subscription?.state !== 'muted') {
        unread += count;
      }
      return {
        chatId: chat.id,
        unread: count,
        lastReadMessageId:
          users.find((user) => user.chatId === chat.id && user.orgUserId === orgUserId)
            ?.lastReadMessageId ?? null,
        subscription,
      };
    });
    return { orgUserId, unread: { unread: unread + requests, requests }, chats: states };
  };

  const repo: ChatRepository = {
    async lockDirectPair() {},
    async findDirect(orgId, communityId, a, b) {
      const wanted = pair(a, b);
      const chat = chats.find((row) => {
        if (row.orgId !== orgId || row.communityId !== communityId || row.kind !== 'direct') {
          return false;
        }
        const ids = users.filter((user) => user.chatId === row.id).map((user) => user.orgUserId);
        return ids.length === 2 && pair(ids[0] ?? '', ids[1] ?? '') === wanted;
      });
      return chat ? { ...chat } : null;
    },
    async insertChat(_orgId, chat) {
      chats.push({ ...chat });
      return { ...chat };
    },
    async updateChat(orgId, id, patch) {
      const chat = chats.find((row) => row.orgId === orgId && row.id === id);
      if (!chat) {
        return null;
      }
      Object.assign(chat, patch, { updatedAt: new Date() });
      return { ...chat };
    },
    async findChat(orgId, id) {
      const chat = chats.find((row) => row.orgId === orgId && row.id === id);
      return chat ? { ...chat } : null;
    },
    async listForUser(orgId, communityId, orgUserId, query) {
      const all = chats
        .filter(
          (chat) =>
            chat.orgId === orgId &&
            chat.communityId === communityId &&
            activeIn(chat.id, orgUserId) &&
            (query.requests === undefined || isRequestTo(chat, orgUserId) === query.requests),
        )
        .map((chat) => inboxRowOf(chat, orgUserId));
      const from = (query.page - 1) * query.pageSize;
      return {
        rows: all.slice(from, from + query.pageSize),
        total: all.length,
        page: query.page,
        pageSize: query.pageSize,
      };
    },
    async inboxRow(orgId, chatId, orgUserId) {
      const chat = chats.find((row) => row.orgId === orgId && row.id === chatId);
      return chat && activeIn(chatId, orgUserId) ? inboxRowOf(chat, orgUserId) : null;
    },
    async participants(orgId, chatId) {
      const rows = users
        .filter((user) => user.orgId === orgId && user.chatId === chatId)
        .map((user) => ({ ...user }));
      if (race.joinAfterRead && !tx.open) {
        users.push(race.joinAfterRead);
        race.joinAfterRead = null;
      }
      return rows;
    },
    async activeParticipants(orgId, chatId) {
      return users
        .filter((user) => user.orgId === orgId && user.chatId === chatId && !user.leftAt)
        .map((user) => user.orgUserId)
        .sort();
    },
    async unreadSummary(_orgId, communityId, orgUserId, at) {
      return statesOf(communityId, orgUserId, at).unread;
    },
    async memberStates(_orgId, communityId, orgUserIds, at) {
      return orgUserIds.map((orgUserId) => statesOf(communityId, orgUserId, at));
    },
    async findByClientId(orgId, chatId, orgUserId, clientId) {
      if (race.missClientId) {
        race.missClientId = false;
        return null;
      }
      const message = messages.find(
        (row) =>
          row.orgId === orgId &&
          row.chatId === chatId &&
          row.orgUserId === orgUserId &&
          row.clientId === clientId,
      );
      return message ? { ...message } : null;
    },
    async join(_orgId, user) {
      const existing = users.find(
        (row) => row.chatId === user.chatId && row.orgUserId === user.orgUserId,
      );
      if (existing) {
        existing.leftAt = null;
        return;
      }
      users.push({ ...user });
    },
    async markLeft(orgId, chatId, orgUserId, leftAt) {
      const user = users.find(
        (row) => row.orgId === orgId && row.chatId === chatId && row.orgUserId === orgUserId,
      );
      if (user) {
        user.leftAt = leftAt;
      }
    },
    async setRead(orgId, chatId, orgUserId, messageId) {
      const user = users.find(
        (row) => row.orgId === orgId && row.chatId === chatId && row.orgUserId === orgUserId,
      );
      const target = messages.find((row) => row.id === messageId);
      const current = messages.find((row) => row.id === user?.lastReadMessageId);
      if (!user || !target || (current && !after(target, current))) {
        return false;
      }
      user.lastReadMessageId = messageId;
      return true;
    },
    async unreadFor(orgId, chatId, orgUserId) {
      const marker = users.find(
        (row) => row.orgId === orgId && row.chatId === chatId && row.orgUserId === orgUserId,
      )?.lastReadMessageId;
      const readAt = messages.find((row) => row.id === marker)?.createdAt.getTime() ?? -Infinity;
      const unread = messages
        .filter(
          (row) =>
            row.chatId === chatId &&
            row.orgUserId !== orgUserId &&
            row.deletedAt === null &&
            row.createdAt.getTime() > readAt,
        )
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1));
      const latest = unread[0];
      return {
        count: unread.length,
        latest: latest
          ? { messageId: latest.id, senderOrgUserId: latest.orgUserId, body: latest.body }
          : null,
      };
    },
    async insertMessage(_orgId, message) {
      if (
        message.clientId !== null &&
        messages.some(
          (row) =>
            row.chatId === message.chatId &&
            row.orgUserId === message.orgUserId &&
            row.clientId === message.clientId,
        )
      ) {
        throw new ConflictError('A message with this client id already exists');
      }
      messages.push({ ...message });
      return { ...message };
    },
    async updateMessage(orgId, id, patch) {
      const message = messages.find((row) => row.orgId === orgId && row.id === id);
      if (!message) {
        return null;
      }
      Object.assign(message, patch, { updatedAt: new Date() });
      return { ...message };
    },
    async findMessage(orgId, id) {
      const message = messages.find((row) => row.orgId === orgId && row.id === id);
      return message ? { ...message } : null;
    },
    async listMessages(orgId, chatId, query) {
      const matched = messages
        .filter((row) => row.orgId === orgId && row.chatId === chatId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1));
      const start = (query.page - 1) * query.pageSize;
      const page: Page<Message> = {
        rows: matched.slice(start, start + query.pageSize).map((row) => ({ ...row })),
        total: matched.length,
        page: query.page,
        pageSize: query.pageSize,
      };
      return page;
    },
    async attach(_orgId, _communityId, messageId, assetIds) {
      attachments.push({ messageId, assetIds: [...assetIds] });
    },
    async attachmentsOf(_orgId, messageIds) {
      return Object.fromEntries(
        messageIds.flatMap((messageId) => {
          const ids = attachments
            .filter((row) => row.messageId === messageId)
            .flatMap((row) => row.assetIds);
          return ids.length > 0 ? [[messageId, ids]] : [];
        }),
      );
    },
    async blockedWith(_orgId, communityId, orgUserId, otherIds) {
      queries.blockedWith += 1;
      return otherIds.filter((other) =>
        blocks.some(
          (row) =>
            row.communityId === communityId &&
            ((row.blocker === orgUserId && row.blocked === other) ||
              (row.blocker === other && row.blocked === orgUserId)),
        ),
      );
    },
    async setReaction(_orgId, _communityId, messageId, orgUserId, emoji) {
      const index = reactions.findIndex(
        (row) => row.messageId === messageId && row.orgUserId === orgUserId,
      );
      const before = index >= 0 ? reactions[index]!.emoji : null;
      if (index >= 0) {
        reactions.splice(index, 1);
      }
      if (emoji !== null) {
        reactions.push({ messageId, orgUserId, emoji });
      }
      return { inserted: index < 0 && emoji !== null, changed: before !== emoji };
    },
    async reactionsOf(_orgId, messageIds, viewerId) {
      const byMessage: Record<
        string,
        { reactions: Record<string, number>; viewerReaction?: string }
      > = {};
      for (const row of reactions) {
        if (!messageIds.includes(row.messageId)) {
          continue;
        }
        const entry = (byMessage[row.messageId] ??= { reactions: {} });
        entry.reactions[row.emoji] = (entry.reactions[row.emoji] ?? 0) + 1;
        if (row.orgUserId === viewerId) {
          entry.viewerReaction = row.emoji;
        }
      }
      return byMessage;
    },
    async block(_orgId, communityId, blocker, blocked) {
      if (
        !blocks.some(
          (row) =>
            row.communityId === communityId && row.blocker === blocker && row.blocked === blocked,
        )
      ) {
        blocks.push({ communityId, blocker, blocked });
      }
    },
    async unblock(_orgId, communityId, blocker, blocked) {
      const index = blocks.findIndex(
        (row) =>
          row.communityId === communityId && row.blocker === blocker && row.blocked === blocked,
      );
      if (index >= 0) {
        blocks.splice(index, 1);
      }
    },
    async isBlocked(_orgId, communityId, a, b) {
      queries.isBlocked += 1;
      return blocks.some(
        (row) =>
          row.communityId === communityId &&
          ((row.blocker === a && row.blocked === b) || (row.blocker === b && row.blocked === a)),
      );
    },
    async anyBlockedAmong(_orgId, communityId, orgUserIds) {
      queries.anyBlockedAmong += 1;
      return blocks.some(
        (row) =>
          row.communityId === communityId &&
          orgUserIds.includes(row.blocker) &&
          orgUserIds.includes(row.blocked),
      );
    },
    async findFlag(orgId, messageId, orgUserId) {
      const flag = flags.find(
        (row) => row.orgId === orgId && row.messageId === messageId && row.orgUserId === orgUserId,
      );
      return flag ? { ...flag } : null;
    },
    async chatSummaries(orgId, chatIds) {
      return chats
        .filter((chat) => chat.orgId === orgId && chatIds.includes(chat.id))
        .map((chat) => ({
          chat: { ...chat },
          participantIds: users
            .filter((user) => user.chatId === chat.id && user.leftAt === null)
            .map((user) => user.orgUserId)
            .sort(),
        }));
    },
    async insertFlag(_orgId, flag) {
      if (
        flags.some((row) => row.messageId === flag.messageId && row.orgUserId === flag.orgUserId)
      ) {
        return null;
      }
      flags.push({ ...flag });
      return { ...flag };
    },
    async listOpenFlags(orgId, communityId, limit) {
      return flags
        .filter(
          (flag) => flag.orgId === orgId && flag.communityId === communityId && !flag.resolvedAt,
        )
        .slice(0, limit)
        .map((flag) => ({ ...flag }));
    },
    async messagesByIds(orgId, ids) {
      return messages
        .filter((row) => row.orgId === orgId && ids.includes(row.id))
        .map((row) => ({ ...row }));
    },
    async resolveFlags(orgId, messageId, resolved) {
      for (const flag of flags) {
        if (flag.orgId === orgId && flag.messageId === messageId && !flag.resolvedAt) {
          flag.resolvedAt = resolved.resolvedAt;
          flag.resolvedBy = resolved.resolvedBy;
          flag.resolution = resolved.resolution;
        }
      }
    },
    async resolveOpenFlagsForChat(orgId, chatId, resolved) {
      const ids = new Set(
        messages.filter((row) => row.orgId === orgId && row.chatId === chatId).map((row) => row.id),
      );
      for (const flag of flags) {
        if (flag.orgId === orgId && ids.has(flag.messageId) && !flag.resolvedAt) {
          flag.resolvedAt = resolved.resolvedAt;
          flag.resolvedBy = resolved.resolvedBy;
          flag.resolution = resolved.resolution;
        }
      }
    },
  };

  const opens = (actor: Actor, communityId: string) =>
    members.has(actor.id) || actor.permissions.has('communities:read', communityId);
  const access: CommunityAccess = {
    async isCommunityMember(communityId, actor) {
      return opens(actor, communityId);
    },
    async canOpenSpace() {
      return true;
    },
    async canOpen() {
      return true;
    },
    async openSpaceIds() {
      return [];
    },
    async communityMembersAmong(_orgId, communityId, orgUserIds) {
      return orgUserIds.filter((id) => opens(personOf(id), communityId));
    },
    async spaceOpenersAmong(_orgId, _spaceId, orgUserIds) {
      return orgUserIds;
    },
  };

  const authors: AuthorPermissionReader = {
    async permissionsOfMany(_orgId, orgUserIds) {
      return new Map(orgUserIds.map((id) => [id, personOf(id).permissions]));
    },
    async actorFor(_orgId, orgUserId) {
      return people.get(orgUserId) ?? null;
    },
    systemActor(orgId) {
      return actorWith({ owner: true, id: 'system', orgId });
    },
  };

  const mentions = mentionStore();
  const tx = { open: false };
  const escapes: string[] = [];
  const uow: ChatUnitOfWork = {
    run: async (fn) => {
      tx.open = true;
      try {
        return await fn({
          chats: repo,
          mentions: mentions.repo,
          outbox: {
            async append(events: NewDomainEvent[]) {
              calls.push(events);
            },
          },
        });
      } finally {
        tx.open = false;
      }
    },
  };
  const outsideTx = <T extends object>(name: string, port: T): T =>
    new Proxy(port, {
      get(target, key, receiver) {
        const value = Reflect.get(target, key, receiver) as unknown;
        if (typeof value !== 'function') {
          return value;
        }
        return (...args: unknown[]) => {
          if (tx.open) {
            escapes.push(`${name}.${String(key)}`);
          }
          return (value as (...a: unknown[]) => unknown).apply(target, args);
        };
      },
    });

  const svc = new ChatServiceImpl({
    repo,
    access: outsideTx('access', access),
    subscriptions: subscriptions.repo,
    mentions: mentions.repo,
    content: {
      async getDmSettings(communityId) {
        if (settings === null) {
          return null;
        }
        if (communityId !== COMMUNITY && communityId !== 'cmy_2') {
          return null;
        }
        return settings;
      },
    },
    authors: outsideTx('authors', authors),
    profiles: {
      async authorsOf(orgId, orgUserIds) {
        return Object.fromEntries(
          orgUserIds.map((id) => [
            id,
            {
              id,
              firstName: id,
              lastName: null,
              email: `${id}@example.com`,
              image: null,
              displayName: id === member.id ? 'Sarah' : null,
              headline: null,
              imageAssetOrgId: id === member.id ? 'org_elsewhere' : id === other.id ? ORG : null,
              imageAssetId:
                id === member.id ? 'ast_photo' : id === other.id ? 'ast_other_photo' : null,
            },
          ]),
        );
      },
    },
    images: outsideTx('images', {
      signFile: async () => 'https://signed',
      ...(options?.images ?? { ownsImage: async () => true }),
    }),
    fileUrls,
    uow,
    ...(options?.pubsub && { pubsub: options.pubsub }),
  });

  return {
    svc,
    escapes,
    race,
    subscriptions,
    mentions,
    chats,
    messages,
    attachments,
    flags,
    users,
    calls,
    queries,
    block(communityId: string, blocker: string, blocked: string) {
      blocks.push({ communityId, blocker, blocked });
    },
    dropMember(id: string) {
      members.delete(id);
    },
  };
}

describe('chats', () => {
  it('reads other services before the transaction, never while it holds a connection', async () => {
    const { svc, escapes } = harness();
    const chat = await svc.startDirect(
      { communityId: COMMUNITY, orgUserId: other.id, body: 'Hello', assetIds: ['ast_1'] },
      member,
    );
    await svc.startDirect(
      { communityId: COMMUNITY, orgUserId: member.id, body: 'Again', assetIds: ['ast_2'] },
      other,
    );
    await svc.send(
      chat.id,
      { body: 'Third', replyToId: null, assetIds: ['ast_3'], clientId: undefined },
      member,
    );
    expect(escapes).toEqual([]);
  });

  it('refuses a send when someone joined between its early reads and its transaction', async () => {
    const h = harness();
    const chat = await h.svc.startGroup(
      { communityId: COMMUNITY, orgUserIds: [other.id, third.id] },
      member,
    );
    const row = h.users.find((user) => user.chatId === chat.id && user.orgUserId === other.id)!;
    h.race.joinAfterRead = { ...row, orgUserId: fourth.id };
    await expect(
      h.svc.send(
        chat.id,
        { body: 'Hi', replyToId: null, assetIds: [], clientId: undefined },
        member,
      ),
    ).rejects.toThrow('This chat changed while you were sending; send again');
    expect(h.messages.filter((message) => message.chatId === chat.id)).toEqual([]);
  });

  it('starts a direct chat as a request with its message and records the chat once', async () => {
    const { svc, calls } = harness();
    const chat = await svc.startDirect(
      {
        communityId: COMMUNITY,
        orgUserId: other.id,
        body: 'Hello',
        assetIds: [],
      },
      member,
    );
    expect(chat.status).toBe('pending');
    expect(chat.kind).toBe('direct');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.map((event) => event.type)).toEqual([
      'discussion.chat.created',
      'discussion.message.sent',
    ]);
    expect(calls[0]?.[0]?.metadata).toEqual({ actorOrgUserId: member.id });
    expect(calls[0]?.[1]?.metadata).toEqual({ actorOrgUserId: member.id, chatStatus: 'pending' });
    expect(dataOf(calls[0]![0]!).participantIds).toEqual([member.id, other.id].sort());
  });

  it('refuses a message request started without a message', async () => {
    const { svc, calls, chats } = harness();
    await expect(
      svc.startDirect(
        {
          communityId: COMMUNITY,
          orgUserId: other.id,
          body: null,
          assetIds: [],
        },
        member,
      ),
    ).rejects.toThrow('A message request needs a message');
    expect(chats).toHaveLength(0);
    expect(calls).toHaveLength(0);
  });

  it('sends the first message in the same transaction as the new chat', async () => {
    const { svc, calls, attachments } = harness();
    const chat = await svc.startDirect(
      {
        communityId: COMMUNITY,
        orgUserId: other.id,
        body: 'Hello',
        assetIds: ['ast_1'],
      },
      member,
    );
    expect(calls[0]?.map((event) => event.type)).toEqual([
      'discussion.chat.created',
      'discussion.message.sent',
    ]);
    expect(dataOf(calls[0]![1]!).chatId).toBe(chat.id);
    expect(dataOf(calls[0]![1]!).communityId).toBe(COMMUNITY);
    expect(attachments).toEqual([{ messageId: dataOf(calls[0]![1]!).id, assetIds: ['ast_1'] }]);
  });

  it('refuses an attachment the sender did not upload', async () => {
    const { svc, attachments } = harness({
      settings: { firstMessageIsRequest: false },
      images: { ownsImage: async () => false },
    });
    await expect(
      svc.startDirect(
        {
          communityId: COMMUNITY,
          orgUserId: other.id,
          body: 'Hello',
          assetIds: ['ast_paid'],
        },
        member,
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
    const chat = await svc.startDirect(
      {
        communityId: COMMUNITY,
        orgUserId: other.id,
        body: 'Hello',
        assetIds: [],
      },
      member,
    );
    await expect(
      svc.send(chat.id, { body: 'File', replyToId: null, assetIds: ['ast_paid'] }, member),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(attachments).toEqual([]);
  });

  it('returns the existing direct chat and writes a new body into it', async () => {
    const { svc, calls, messages } = harness();
    const input = { communityId: COMMUNITY, orgUserId: other.id, body: 'Again', assetIds: [] };
    const first = await svc.startDirect(input, member);
    const quiet = await svc.startDirect({ ...input, body: null }, member);
    expect(quiet.id).toBe(first.id);
    expect(calls).toHaveLength(1);
    const second = await svc.startDirect({ ...input, orgUserId: member.id }, other);
    expect(second.id).toBe(first.id);
    expect(calls[1]?.map((event) => event.type)).toEqual([
      'discussion.chat.updated',
      'discussion.message.sent',
    ]);
    expect(
      messages.some((message) => message.orgUserId === other.id && message.body === 'Again'),
    ).toBe(true);
    const elsewhere = await svc.startDirect({ ...input, communityId: 'cmy_2' }, member);
    expect(elsewhere.id).not.toBe(first.id);
  });

  it('opens a direct chat when the first message is not a request', async () => {
    const { svc } = harness({ settings: { firstMessageIsRequest: false } });
    const chat = await svc.startDirect(
      {
        communityId: COMMUNITY,
        orgUserId: other.id,
        body: null,
        assetIds: [],
      },
      member,
    );
    expect(chat.status).toBe('open');
  });

  it('refuses a direct chat the settings or the membership do not allow', async () => {
    const { svc } = harness();
    await expect(
      svc.startDirect(
        {
          communityId: COMMUNITY,
          orgUserId: member.id,
          body: null,
          assetIds: [],
        },
        member,
      ),
    ).rejects.toBeInstanceOf(InvalidInputError);
    await expect(
      svc.startDirect(
        {
          communityId: COMMUNITY,
          orgUserId: other.id,
          body: null,
          assetIds: [],
        },
        outsider,
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      svc.startDirect(
        {
          communityId: 'cmy_missing',
          orgUserId: other.id,
          body: null,
          assetIds: [],
        },
        member,
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
    const off = harness({ settings: null });
    await expect(
      off.svc.startDirect(
        {
          communityId: COMMUNITY,
          orgUserId: other.id,
          body: null,
          assetIds: [],
        },
        member,
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
    const closed = harness({ settings: { memberToMember: false } });
    await expect(
      closed.svc.startDirect(
        {
          communityId: COMMUNITY,
          orgUserId: other.id,
          body: null,
          assetIds: [],
        },
        member,
      ),
    ).rejects.toThrow('You cannot message this person');
    const disabled = harness({ settings: { enabled: false } });
    await expect(
      disabled.svc.startDirect(
        {
          communityId: COMMUNITY,
          orgUserId: member.id,
          body: null,
          assetIds: [],
        },
        staff,
      ),
    ).rejects.toThrow('Direct messages are off');
  });

  it('starts a group chat open and addresses each added person', async () => {
    const { svc, calls } = harness();
    const chat = await svc.startGroup(
      {
        communityId: COMMUNITY,
        orgUserIds: [other.id, third.id, member.id],
      },
      member,
    );
    expect(chat.kind).toBe('group');
    expect(chat.status).toBe('open');
    expect(calls[0]?.map((event) => event.type)).toEqual([
      'discussion.chat.created',
      'discussion.chat.participant.added',
      'discussion.chat.participant.added',
    ]);
    expect(calls[0]?.slice(1).map((event) => dataOf(event).orgUserId)).toEqual(
      [other.id, third.id].sort(),
    );
    await expect(
      svc.startGroup({ communityId: COMMUNITY, orgUserIds: [other.id] }, member),
    ).rejects.toThrow('A group chat needs three people');
    const small = harness({ settings: { groupSize: 2 } });
    await expect(
      small.svc.startGroup(
        {
          communityId: COMMUNITY,
          orgUserIds: [other.id, third.id],
        },
        member,
      ),
    ).rejects.toThrow('This group is full');
    const noGroups = harness({ settings: { groupChats: false } });
    await expect(
      noGroups.svc.startGroup(
        {
          communityId: COMMUNITY,
          orgUserIds: [other.id, third.id],
        },
        member,
      ),
    ).rejects.toThrow('Group chats are off');
  });

  it('refuses every creator send while a request is pending and opens it on a reply', async () => {
    const { svc, calls, chats } = harness();
    const chat = await svc.startDirect(
      {
        communityId: COMMUNITY,
        orgUserId: other.id,
        body: 'First',
        assetIds: [],
      },
      member,
    );
    await expect(svc.accept(chat.id, member)).rejects.toThrow('You cannot accept this request');
    const before = calls.length;
    await expect(svc.send(chat.id, messageInput('No'), member)).rejects.toThrow(
      'You cannot send in this chat',
    );
    await expect(
      svc.startDirect(
        {
          communityId: COMMUNITY,
          orgUserId: other.id,
          body: 'Again',
          assetIds: [],
        },
        member,
      ),
    ).rejects.toThrow('You cannot send in this chat');
    expect(calls).toHaveLength(before);
    expect(chats.find((row) => row.id === chat.id)?.status).toBe('pending');
    const sent = await svc.send(chat.id, messageInput('Hello'), other);
    expect(sent.communityId).toBe(COMMUNITY);
    expect(chats.find((row) => row.id === chat.id)?.status).toBe('open');
    expect(calls.at(-1)?.map((event) => event.type)).toEqual([
      'discussion.chat.updated',
      'discussion.message.sent',
    ]);
    expect(calls.at(-1)?.[0]?.metadata).toEqual({ actorOrgUserId: other.id });
    expect(calls.at(-1)?.[1]?.metadata).toEqual({ actorOrgUserId: other.id, chatStatus: 'open' });
    await expect(svc.accept(chat.id, other)).rejects.toThrow('This chat is not a request');
    await svc.send(chat.id, messageInput('Hi'), member);
  });

  it('blocks a direct chat in this community without telling the blocked person', async () => {
    const { svc, calls } = harness({ settings: { firstMessageIsRequest: false } });
    const chat = await svc.startDirect(
      {
        communityId: COMMUNITY,
        orgUserId: other.id,
        body: null,
        assetIds: [],
      },
      member,
    );
    const elsewhere = await svc.startDirect(
      {
        communityId: 'cmy_2',
        orgUserId: other.id,
        body: null,
        assetIds: [],
      },
      member,
    );
    const before = calls.length;
    await svc.block(COMMUNITY, other.id, member);
    expect(calls).toHaveLength(before);
    const seen = (await svc.listChats(COMMUNITY, { page: 1, pageSize: 20 }, other)).rows.find(
      (item) => item.chat.id === chat.id,
    );
    expect(seen?.chat.status).toBe('open');
    await expect(svc.send(chat.id, messageInput('Hey'), other)).rejects.toThrow(
      'You cannot send in this chat',
    );
    await expect(
      svc.startDirect(
        {
          communityId: COMMUNITY,
          orgUserId: member.id,
          body: 'Hey',
          assetIds: [],
        },
        other,
      ),
    ).rejects.toThrow('You cannot send in this chat');
    await expect(svc.send(chat.id, messageInput('Hey'), member)).rejects.toThrow(
      'You cannot send in this chat',
    );
    await svc.send(elsewhere.id, messageInput('Still here'), member);
    await svc.unblock(COMMUNITY, other.id, member);
    expect(calls.at(-1)?.map((event) => event.type)).toEqual(['discussion.message.sent']);
    await svc.send(chat.id, messageInput('Back'), member);
  });

  it('refuses a blocked person a new chat with the ordinary refusal', async () => {
    const { svc } = harness({ settings: { firstMessageIsRequest: false } });
    await svc.block(COMMUNITY, other.id, member);
    await expect(
      svc.startDirect(
        {
          communityId: COMMUNITY,
          orgUserId: member.id,
          body: 'Hello',
          assetIds: [],
        },
        other,
      ),
    ).rejects.toThrow('You cannot message this person');
    await expect(
      svc.startGroup({ communityId: COMMUNITY, orgUserIds: [member.id, third.id] }, other),
    ).rejects.toThrow('You cannot message this person');
  });

  it('keeps a locked direct chat locked when the block is lifted', async () => {
    const { svc } = harness({ settings: { firstMessageIsRequest: false } });
    const chat = await svc.startDirect(
      {
        communityId: COMMUNITY,
        orgUserId: other.id,
        body: null,
        assetIds: [],
      },
      member,
    );
    await svc.lock(chat.id, null, staff);
    await svc.block(COMMUNITY, other.id, member);
    await svc.unblock(COMMUNITY, other.id, member);
    await expect(svc.send(chat.id, messageInput('No'), member)).rejects.toThrow(
      'This chat is locked',
    );
    await svc.unlock(chat.id, null, staff);
    await svc.send(chat.id, messageInput('Yes'), member);
  });

  it('stops only the blocked pair from sending in a group', async () => {
    const { svc } = harness();
    const chat = await svc.startGroup(
      {
        communityId: COMMUNITY,
        orgUserIds: [other.id, third.id],
      },
      member,
    );
    await svc.block(COMMUNITY, other.id, member);
    const stored = (await svc.listChats(COMMUNITY, PAGE, third)).rows;
    expect(stored[0]?.chat.status).toBe('open');
    await expect(svc.send(chat.id, messageInput('No'), member)).rejects.toThrow(
      'You cannot send in this chat',
    );
    await svc.send(chat.id, messageInput('Yes'), third);
  });

  it('records a leave and an added person on their own events', async () => {
    const { svc, calls } = harness();
    const chat = await svc.startGroup(
      {
        communityId: COMMUNITY,
        orgUserIds: [other.id, third.id],
      },
      member,
    );
    const left = await svc.leave(chat.id, third);
    expect(left.id).toBe(chat.id);
    expect(dataOf(calls.at(-1)![0]!).participantIds).toEqual([member.id, other.id].sort());
    await expect(svc.send(chat.id, messageInput('Gone'), third)).rejects.toThrow(
      'You are not in this chat',
    );
    await svc.addParticipant(chat.id, fourth.id, member);
    expect(calls.at(-1)?.map((event) => event.type)).toEqual(['discussion.chat.participant.added']);
    expect(dataOf(calls.at(-1)![0]!).addedBy).toBe(member.id);
    await svc.leave(chat.id, fourth);
    await svc.addParticipant(chat.id, fourth.id, member);
    expect(calls.at(-1)?.map((event) => event.type)).toEqual(['discussion.chat.participant.added']);
    await expect(svc.addParticipant(chat.id, other.id, member)).rejects.toThrow(
      'That person is already in this chat',
    );
  });

  it('finds a chat or message to moderate only in the community it names', async () => {
    const { svc, calls, flags } = harness({ settings: { firstMessageIsRequest: false } });
    const chat = await svc.startDirect(
      {
        communityId: COMMUNITY,
        orgUserId: other.id,
        body: 'Hello',
        assetIds: [],
      },
      member,
    );
    const messageId = String(dataOf(calls[0]![1]!).id);
    await svc.flagMessage(messageId, 'spam', other);
    await expect(
      svc.resolveMessageFlags(messageId, 'dismissed', 'cmy_other', staff),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(flags[0]?.resolution).toBeNull();
    await svc.resolveMessageFlags(messageId, 'dismissed', COMMUNITY, staff);
    expect(flags[0]?.resolution).toBe('dismissed');
    await expect(svc.lock(chat.id, 'cmy_other', staff)).rejects.toBeInstanceOf(NotFoundError);
    expect((await svc.lock(chat.id, COMMUNITY, staff)).lockedAt).toBeInstanceOf(Date);
    await expect(svc.unlock(chat.id, 'cmy_other', staff)).rejects.toBeInstanceOf(NotFoundError);
    expect((await svc.unlock(chat.id, COMMUNITY, staff)).lockedAt).toBeNull();
  });

  it('lets staff lock a chat and work the message queue', async () => {
    const { svc, calls, flags } = harness({ settings: { firstMessageIsRequest: false } });
    const chat = await svc.startDirect(
      {
        communityId: COMMUNITY,
        orgUserId: other.id,
        body: 'Hello',
        assetIds: [],
      },
      member,
    );
    await expect(svc.lock(chat.id, null, member)).rejects.toThrow('You need communities:moderate');
    await expect(svc.lock(chat.id, null, moderator)).rejects.toThrow(
      'You need communities:moderate',
    );
    await svc.lock(chat.id, null, staff);
    await expect(svc.unlock(chat.id, null, moderator)).rejects.toThrow(
      'You need communities:moderate',
    );
    await svc.unlock(chat.id, null, staff);
    await svc.lock(chat.id, null, staff);
    await expect(svc.send(chat.id, messageInput('Later'), member)).rejects.toThrow(
      'This chat is locked',
    );
    const page = { page: 1, pageSize: 20 };
    await expect(svc.messages(chat.id, page, member)).resolves.toMatchObject({
      total: 1,
    });
    await expect(svc.messageQueue(COMMUNITY, member)).rejects.toThrow(
      'You need communities:moderate',
    );
    await expect(svc.messageQueue(COMMUNITY, moderator)).rejects.toThrow(
      'You need communities:moderate',
    );
    await expect(svc.messageQueue(COMMUNITY, staff)).resolves.toBeDefined();
    const messageId = String(dataOf(calls[0]![1]!).id);
    await svc.flagMessage(messageId, 'spam', other);
    expect(calls.at(-1)?.map((event) => event.type)).toEqual(['discussion.message.reported']);
    await svc.resolveMessageFlags(messageId, 'dismissed', null, staff);
    expect(flags[0]?.resolution).toBe('dismissed');
    expect(calls.at(-1)?.map((event) => event.type)).toEqual(['discussion.message.reported']);
    await expect(svc.resolveMessageFlags(messageId, 'dismissed', null, member)).rejects.toThrow(
      'You need communities:moderate',
    );
    await expect(svc.resolveMessageFlags(messageId, 'dismissed', null, moderator)).rejects.toThrow(
      'You need communities:moderate',
    );
  });

  it('serves each message with its attachments in order, by stable URL, to a participant', async () => {
    const { svc } = harness();
    const chat = await svc.startGroup(
      {
        communityId: COMMUNITY,
        orgUserIds: [other.id, moderator.id],
      },
      member,
    );
    const sent = await svc.send(
      chat.id,
      {
        body: 'Look',
        replyToId: null,
        assetIds: ['asset_2', 'asset_gone', 'asset_1'],
      },
      member,
    );
    expect(sent.attachments).toEqual([
      { assetId: 'asset_2', url: fileUrls.messageAttachment(chat.id, sent.id, 'asset_2') },
      { assetId: 'asset_gone', url: fileUrls.messageAttachment(chat.id, sent.id, 'asset_gone') },
      { assetId: 'asset_1', url: fileUrls.messageAttachment(chat.id, sent.id, 'asset_1') },
    ]);
    const plain = await svc.send(chat.id, messageInput('Nice'), other);
    expect(plain.attachments).toEqual([]);
    const page = await svc.messages(chat.id, { page: 1, pageSize: 20 }, other);
    const byId = new Map(page.rows.map((row) => [row.id, row.attachments]));
    expect(byId.get(sent.id)).toEqual(sent.attachments);
    expect(byId.get(plain.id)).toEqual([]);
    await expect(svc.messages(chat.id, { page: 1, pageSize: 20 }, staff)).rejects.toThrow(
      'You are not in this chat',
    );
    await svc.leave(chat.id, other);
    await expect(svc.messages(chat.id, { page: 1, pageSize: 20 }, other)).rejects.toThrow(
      'You are not in this chat',
    );
  });

  it('returns the sender and attachments from send, edit and delete', async () => {
    const { svc } = harness();
    const chat = await svc.startGroup(
      {
        communityId: COMMUNITY,
        orgUserIds: [other.id, staff.id],
      },
      member,
    );
    const sent = await svc.send(
      chat.id,
      {
        body: 'Look',
        replyToId: null,
        assetIds: ['asset_1'],
      },
      other,
    );
    const sender = {
      id: other.id,
      imageAssetId: 'ast_other_photo',
      imageUrl: fileUrls.personImage('ou_other'),
    };
    expect(sent).toMatchObject({
      sender,
      attachments: [{ assetId: 'asset_1', url: expect.stringMatching(/\/attachments\/asset_1$/) }],
    });
    const same = await svc.editMessage(sent.id, 'Look', other);
    expect(same).toMatchObject({ sender, attachments: [{ assetId: 'asset_1' }] });
    const edited = await svc.editMessage(sent.id, 'Look here', other);
    expect(edited).toMatchObject({
      body: 'Look here',
      sender,
      attachments: [{ assetId: 'asset_1' }],
    });
    const removedByAuthor = await svc.deleteMessage(sent.id, other);
    expect(removedByAuthor).toMatchObject({ body: '', sender, attachments: [] });
    const kept = await svc.send(
      chat.id,
      {
        body: 'Again',
        replyToId: null,
        assetIds: ['asset_2'],
      },
      other,
    );
    const removedByStaff = await svc.deleteMessage(kept.id, staff);
    expect(removedByStaff).toMatchObject({
      body: 'Again',
      attachments: [{ assetId: 'asset_2', url: expect.stringMatching(/\/attachments\/asset_2$/) }],
    });
  });

  it('does not sign a sender photo from another org', async () => {
    const { svc } = harness();
    const chat = await svc.startGroup(
      {
        communityId: COMMUNITY,
        orgUserIds: [other.id, third.id],
      },
      member,
    );
    const sent = await svc.send(chat.id, messageInput('Hi'), member);
    expect(sent.sender).toMatchObject({ id: member.id, imageAssetId: null, imageUrl: null });
  });

  it('deletes a message for the author or staff and hides the body from members', async () => {
    const { svc, flags } = harness();
    const chat = await svc.startGroup(
      {
        communityId: COMMUNITY,
        orgUserIds: [other.id, staff.id],
      },
      member,
    );
    const sent = await svc.send(chat.id, messageInput('Secret'), member);
    await expect(svc.deleteMessage(sent.id, other)).rejects.toThrow(
      'You cannot delete this message',
    );
    await expect(svc.editMessage(sent.id, 'No', other)).rejects.toThrow(
      'You can change only your own message',
    );
    const edited = await svc.editMessage(sent.id, 'Edited', member);
    expect(edited.body).toBe('Edited');
    await svc.flagMessage(sent.id, 'spam', other);
    const removed = await svc.deleteMessage(sent.id, staff);
    expect(removed.deletedAt).toBeInstanceOf(Date);
    expect(flags[0]).toMatchObject({ resolution: 'deleted', resolvedBy: staff.id });
    const seen = await svc.messages(chat.id, { page: 1, pageSize: 20 }, member);
    expect(seen.rows[0]?.body).toBe('');
    expect(seen.rows[0]?.sender).toMatchObject({
      id: member.id,
      displayName: 'Sarah',
      imageAssetId: null,
      imageUrl: null,
    });
    const staffSeen = await svc.messages(chat.id, { page: 1, pageSize: 20 }, staff);
    expect(staffSeen.rows[0]?.body).toBe('Edited');
    await expect(svc.messages(chat.id, { page: 1, pageSize: 20 }, moderator)).rejects.toThrow(
      'You are not in this chat',
    );
  });

  it('rejoins a direct chat the member left and delivers the new body', async () => {
    const { svc, messages, calls } = harness({ settings: { firstMessageIsRequest: false } });
    const chat = await svc.startDirect(
      {
        communityId: COMMUNITY,
        orgUserId: other.id,
        body: null,
        assetIds: [],
      },
      member,
    );
    await svc.leave(chat.id, member);
    await expect(svc.send(chat.id, messageInput('No'), member)).rejects.toThrow(
      'You are not in this chat',
    );
    const again = await svc.startDirect(
      {
        communityId: COMMUNITY,
        orgUserId: other.id,
        body: 'Back',
        assetIds: [],
      },
      member,
    );
    expect(again.id).toBe(chat.id);
    expect(messages.some((message) => message.body === 'Back')).toBe(true);
    expect(calls.at(-1)?.map((event) => event.type)).toEqual([
      'discussion.chat.updated',
      'discussion.message.sent',
    ]);
    expect(dataOf(calls.at(-1)![0]!).participantIds).toEqual([member.id, other.id].sort());
  });

  it('refuses a chat once the member no longer has the community', async () => {
    const { svc, dropMember } = harness({ settings: { firstMessageIsRequest: false } });
    const chat = await svc.startDirect(
      {
        communityId: COMMUNITY,
        orgUserId: other.id,
        body: 'Hello',
        assetIds: [],
      },
      member,
    );
    const page = await svc.messages(chat.id, { page: 1, pageSize: 20 }, member);
    dropMember(member.id);
    await expect(svc.messages(chat.id, { page: 1, pageSize: 20 }, member)).rejects.toThrow(
      'You are not a member of this community',
    );
    await expect(svc.send(chat.id, messageInput('No'), member)).rejects.toThrow(
      'You are not a member of this community',
    );
    await expect(svc.editMessage(page.rows[0]!.id, 'Changed', member)).rejects.toThrow(
      'You are not a member of this community',
    );
  });

  it('refuses an edit when the chat is locked or the author has left', async () => {
    const { svc, flags } = harness({ settings: { firstMessageIsRequest: false } });
    const chat = await svc.startDirect(
      {
        communityId: COMMUNITY,
        orgUserId: other.id,
        body: 'Hello',
        assetIds: [],
      },
      member,
    );
    const page = await svc.messages(chat.id, { page: 1, pageSize: 20 }, member);
    const messageId = page.rows[0]!.id;
    await svc.flagMessage(messageId, 'spam', other);
    await svc.lock(chat.id, null, staff);
    expect(flags[0]).toMatchObject({ resolution: 'locked', resolvedBy: staff.id });
    await expect(svc.editMessage(messageId, 'Changed', member)).rejects.toThrow(
      'You cannot send in this chat',
    );
    await expect(svc.deleteMessage(messageId, member)).rejects.toThrow(
      'You cannot send in this chat',
    );
    await svc.unlock(chat.id, null, staff);
    await svc.leave(chat.id, member);
    await expect(svc.editMessage(messageId, 'Changed', member)).rejects.toThrow(
      'You are not in this chat',
    );
  });

  it('gives a moderator of another community only what any participant has', async () => {
    const { svc } = harness();
    const chat = await svc.startGroup(
      {
        communityId: COMMUNITY,
        orgUserIds: [other.id, moderator.id],
      },
      member,
    );
    const sent = await svc.send(
      chat.id,
      {
        body: 'Look',
        replyToId: null,
        assetIds: ['asset_1'],
      },
      member,
    );
    await svc.flagMessage(sent.id, 'spam', other);
    await expect(svc.deleteMessage(sent.id, moderator)).rejects.toThrow(
      'You cannot delete this message',
    );
    await expect(svc.lock(chat.id, null, moderator)).rejects.toThrow(
      'You need communities:moderate',
    );
    await expect(svc.resolveMessageFlags(sent.id, 'dismissed', null, moderator)).rejects.toThrow(
      'You need communities:moderate',
    );
    expect(await svc.attachmentFile(chat.id, sent.id, 'asset_1', moderator)).toBe('https://signed');
    await svc.deleteMessage(sent.id, member);
    await expect(svc.attachmentFile(chat.id, sent.id, 'asset_1', moderator)).rejects.toThrow(
      NotFoundError,
    );
    const own = await svc.send(chat.id, messageInput('Mine'), moderator);
    expect((await svc.deleteMessage(own.id, moderator)).deletedAt).toBeInstanceOf(Date);
  });

  it('lets staff delete a message in a locked chat they are not in', async () => {
    const { svc, flags } = harness({ settings: { firstMessageIsRequest: false } });
    const chat = await svc.startDirect(
      {
        communityId: COMMUNITY,
        orgUserId: other.id,
        body: 'Hello',
        assetIds: [],
      },
      member,
    );
    const page = await svc.messages(chat.id, { page: 1, pageSize: 20 }, member);
    const messageId = page.rows[0]!.id;
    await svc.flagMessage(messageId, 'spam', other);
    await svc.lock(chat.id, null, staff);
    const removed = await svc.deleteMessage(messageId, staff);
    expect(removed.deletedAt).toBeInstanceOf(Date);
    await expect(svc.deleteMessage(messageId, other)).rejects.toThrow(
      'You cannot delete this message',
    );
    expect(flags[0]).toMatchObject({ resolution: 'locked' });
  });

  it('refuses attachments on a direct chat started without a message', async () => {
    const { svc, chats } = harness();
    await expect(
      svc.startDirect(
        {
          communityId: COMMUNITY,
          orgUserId: other.id,
          body: null,
          assetIds: ['ast_1'],
        },
        member,
      ),
    ).rejects.toThrow('An attachment needs a message');
    expect(chats).toHaveLength(0);
  });

  it('checks the other person in a direct chat they left', async () => {
    const left = harness({ settings: { firstMessageIsRequest: false } });
    const input = { communityId: COMMUNITY, orgUserId: other.id, body: 'Hello', assetIds: [] };
    const chat = await left.svc.startDirect(input, member);
    await left.svc.leave(chat.id, other);
    await left.svc.send(chat.id, messageInput('Still there?'), member);
    left.block(COMMUNITY, other.id, member.id);
    await expect(left.svc.send(chat.id, messageInput('No'), member)).rejects.toThrow(
      'You cannot send in this chat',
    );
    const lapsed = harness({ settings: { firstMessageIsRequest: false } });
    const direct = await lapsed.svc.startDirect(input, member);
    await lapsed.svc.leave(direct.id, other);
    lapsed.dropMember(other.id);
    await expect(lapsed.svc.send(direct.id, messageInput('No'), member)).rejects.toThrow(
      'You cannot send in this chat',
    );
  });

  it('serves no attachments of a deleted message to a member and all of them to staff', async () => {
    const { svc, dropMember } = harness();
    const chat = await svc.startGroup(
      {
        communityId: COMMUNITY,
        orgUserIds: [other.id, third.id],
      },
      member,
    );
    const sent = await svc.send(
      chat.id,
      {
        body: 'Look',
        replyToId: null,
        assetIds: ['asset_1'],
      },
      member,
    );
    const kept = await svc.send(
      chat.id,
      {
        body: 'Keep',
        replyToId: null,
        assetIds: ['asset_2'],
      },
      member,
    );
    await svc.flagMessage(sent.id, 'spam', other);
    await svc.deleteMessage(sent.id, member);
    const page = await svc.messages(chat.id, { page: 1, pageSize: 20 }, other);
    const byId = new Map(page.rows.map((row) => [row.id, row]));
    expect(byId.get(sent.id)).toMatchObject({ body: '', attachments: [] });
    expect(byId.get(kept.id)).toMatchObject({
      body: 'Keep',
      attachments: [{ assetId: 'asset_2', url: expect.stringMatching(/\/attachments\/asset_2$/) }],
    });
    await svc.flagMessage(kept.id, 'rude', third);
    const queue = await svc.messageQueue(COMMUNITY, staff);
    expect(queue.entries.map((entry) => entry.message.attachments)).toEqual([
      [{ assetId: 'asset_2', url: expect.stringMatching(/\/attachments\/asset_2$/) }],
    ]);
    dropMember(other.id);
    await expect(svc.messages(chat.id, { page: 1, pageSize: 20 }, other)).rejects.toThrow(
      'You are not a member of this community',
    );
  });

  it('skips lapsed members in a group and refuses a direct chat with one', async () => {
    const { svc, dropMember } = harness({ settings: { firstMessageIsRequest: false } });
    const group = await svc.startGroup(
      {
        communityId: COMMUNITY,
        orgUserIds: [other.id, third.id],
      },
      member,
    );
    const direct = await svc.startDirect(
      {
        communityId: COMMUNITY,
        orgUserId: third.id,
        body: null,
        assetIds: [],
      },
      member,
    );
    dropMember(third.id);
    await svc.send(group.id, messageInput('Still here'), member);
    await expect(svc.send(direct.id, messageInput('No'), member)).rejects.toThrow(
      'You cannot send in this chat',
    );
  });

  it('checks only the added person against the people in the group, in one query', async () => {
    const { svc, block, queries } = harness();
    const chat = await svc.startGroup(
      {
        communityId: COMMUNITY,
        orgUserIds: [other.id, third.id],
      },
      member,
    );
    expect(queries.anyBlockedAmong).toBe(1);
    expect(queries.isBlocked).toBe(0);
    block(COMMUNITY, member.id, other.id);
    await svc.addParticipant(chat.id, fourth.id, third);
    expect(queries.blockedWith).toBe(1);
    expect(queries.isBlocked).toBe(0);
    await svc.leave(chat.id, fourth);
    block(COMMUNITY, fourth.id, third.id);
    await expect(svc.addParticipant(chat.id, fourth.id, member)).rejects.toThrow(
      'You cannot message this person',
    );
    await expect(
      svc.startGroup({ communityId: COMMUNITY, orgUserIds: [other.id, fourth.id] }, member),
    ).rejects.toThrow('You cannot message this person');
  });

  it('leaves a direct chat untouched when the send that would rejoin it is refused', async () => {
    const { svc, calls, users } = harness({ settings: { firstMessageIsRequest: false } });
    const chat = await svc.startDirect(
      {
        communityId: COMMUNITY,
        orgUserId: other.id,
        body: null,
        assetIds: [],
      },
      member,
    );
    await svc.leave(chat.id, member);
    await svc.block(COMMUNITY, member.id, other);
    const before = calls.length;
    await expect(
      svc.startDirect(
        {
          communityId: COMMUNITY,
          orgUserId: other.id,
          body: 'Back',
          assetIds: [],
        },
        member,
      ),
    ).rejects.toThrow('You cannot send in this chat');
    expect(calls).toHaveLength(before);
    expect(users.find((user) => user.orgUserId === member.id)?.leftAt).toBeInstanceOf(Date);
    await svc.unblock(COMMUNITY, member.id, other);
    await svc.startDirect(
      {
        communityId: COMMUNITY,
        orgUserId: other.id,
        body: null,
        assetIds: [],
      },
      member,
    );
    expect(calls.at(-1)?.map((event) => event.type)).toEqual(['discussion.chat.updated']);
    expect(users.find((user) => user.orgUserId === member.id)?.leftAt).toBeNull();
  });

  it('opens a direct chat at once when either person is staff', async () => {
    const { svc } = harness();
    const fromStaff = await svc.startDirect(
      {
        communityId: COMMUNITY,
        orgUserId: member.id,
        body: null,
        assetIds: [],
      },
      staff,
    );
    expect(fromStaff.status).toBe('open');
    const toStaff = await svc.startDirect(
      {
        communityId: COMMUNITY,
        orgUserId: staff.id,
        body: null,
        assetIds: [],
      },
      other,
    );
    expect(toStaff.status).toBe('open');
    const between = await svc.startDirect(
      {
        communityId: COMMUNITY,
        orgUserId: member.id,
        body: 'Hello',
        assetIds: [],
      },
      moderator,
    );
    expect(between.status).toBe('pending');
  });

  it('returns the existing flag when a message is flagged again', async () => {
    const { svc, calls, flags } = harness({ settings: { firstMessageIsRequest: false } });
    await svc.startDirect(
      {
        communityId: COMMUNITY,
        orgUserId: other.id,
        body: 'Hello',
        assetIds: [],
      },
      member,
    );
    const messageId = String(dataOf(calls[0]![1]!).id);
    const first = await svc.flagMessage(messageId, 'spam', other);
    const before = calls.length;
    const again = await svc.flagMessage(messageId, 'again', other);
    expect(again.id).toBe(first.id);
    expect(again.reason).toBe('spam');
    expect(calls).toHaveLength(before);
    expect(flags).toHaveLength(1);
  });

  it('lists each chat with your mute while it applies, and none once it has ended', async () => {
    const { svc, subscriptions } = harness({ settings: { firstMessageIsRequest: false } });
    const chat = await svc.startDirect(
      {
        communityId: COMMUNITY,
        orgUserId: other.id,
        body: null,
        assetIds: [],
      },
      member,
    );
    const listed = async (actor: Actor) =>
      (await svc.listChats(COMMUNITY, PAGE, actor)).rows[0]?.subscription;
    expect(await listed(member)).toBeNull();
    const mute = (mutedUntil: Date | null) =>
      subscriptions.repo.upsert(ORG, {
        orgId: ORG,
        orgUserId: member.id,
        itemType: 'chat',
        itemId: chat.id,
        state: 'muted',
        mutedUntil,
        createdAt: new Date(),
      });
    await mute(null);
    expect(await listed(member)).toEqual({ state: 'muted', mutedUntil: null });
    expect(await listed(other)).toBeNull();
    const until = new Date('2030-01-01T00:00:00Z');
    await mute(until);
    expect(await listed(member)).toEqual({ state: 'muted', mutedUntil: until });
    await mute(new Date('2020-01-01T00:00:00Z'));
    expect(await listed(member)).toBeNull();
  });

  it('serves each queued message with its flags, its chat and the people in it', async () => {
    const { svc } = harness();
    const chat = await svc.startGroup(
      {
        communityId: COMMUNITY,
        orgUserIds: [other.id, third.id],
      },
      member,
    );
    await svc.send(chat.id, messageInput('Before'), member);
    const sent = await svc.send(
      chat.id,
      {
        body: 'Rude',
        replyToId: null,
        assetIds: ['asset_1'],
      },
      member,
    );
    await svc.flagMessage(sent.id, 'spam', other);
    await svc.flagMessage(sent.id, 'rude', third);
    const queue = await svc.messageQueue(COMMUNITY, staff);
    expect(queue.entries).toHaveLength(1);
    expect(queue.entries[0]).toMatchObject({
      message: {
        id: sent.id,
        body: 'Rude',
        sender: { id: member.id },
        attachments: [
          { assetId: 'asset_1', url: expect.stringMatching(/\/attachments\/asset_1$/) },
        ],
      },
      chat: { id: chat.id, kind: 'group' },
      participantIds: [member.id, other.id, third.id].sort(),
    });
    expect(queue.entries[0]?.flags.map((flag) => flag.reason)).toEqual(['spam', 'rude']);
  });

  it('serves messages newest first with reaction counts and the viewer reaction', async () => {
    const { svc, messages } = harness();
    const chat = await svc.startGroup(
      {
        communityId: COMMUNITY,
        orgUserIds: [other.id, third.id],
      },
      member,
    );
    const first = await svc.send(chat.id, messageInput('First'), member);
    const second = await svc.send(chat.id, messageInput('Second'), other);
    const third_ = await svc.send(chat.id, messageInput('Third'), third);
    for (const [index, id] of [first.id, second.id, third_.id].entries()) {
      messages.find((row) => row.id === id)!.createdAt = new Date(index * 60_000);
    }
    await svc.setReaction(second.id, '👍', member);
    await svc.setReaction(second.id, '👍', other);
    await svc.setReaction(second.id, '🎉', third);
    const page = await svc.messages(chat.id, { page: 1, pageSize: 2 }, member);
    expect(page.rows.map((row) => row.id)).toEqual([third_.id, second.id]);
    expect(page).toMatchObject({ total: 3, page: 1, pageSize: 2 });
    expect(page.rows[0]).toMatchObject({ reactions: {}, viewerReaction: null });
    expect(page.rows[1]).toMatchObject({
      reactions: { '👍': 2, '🎉': 1 },
      viewerReaction: '👍',
    });
    const rest = await svc.messages(chat.id, { page: 2, pageSize: 2 }, third);
    expect(rest.rows.map((row) => row.id)).toEqual([first.id]);
    expect((await svc.messages(chat.id, { page: 1, pageSize: 20 }, third)).rows[1]).toMatchObject({
      viewerReaction: '🎉',
    });
    expect(await svc.setReaction(second.id, null, member)).toMatchObject({
      reactions: { '👍': 1, '🎉': 1 },
    });
    const edited = await svc.editMessage(second.id, 'Second again', other);
    expect(edited).toMatchObject({ reactions: { '👍': 1, '🎉': 1 }, viewerReaction: '👍' });
    expect((await svc.messages(chat.id, { page: 1, pageSize: 20 }, member)).rows[1]).toMatchObject({
      viewerReaction: null,
    });
  });

  it('lists each chat with its last message, blank for a deleted one unless staff reads it', async () => {
    const { svc, messages } = harness({ settings: { firstMessageIsRequest: false } });
    const empty = await svc.startDirect(
      {
        communityId: COMMUNITY,
        orgUserId: other.id,
        body: null,
        assetIds: [],
      },
      member,
    );
    const group = await svc.startGroup(
      {
        communityId: COMMUNITY,
        orgUserIds: [other.id, staff.id],
      },
      member,
    );
    const earlier = await svc.send(group.id, messageInput('Earlier'), other);
    const latest = await svc.send(group.id, messageInput('Latest'), member);
    messages.find((row) => row.id === earlier.id)!.createdAt = new Date(0);
    messages.find((row) => row.id === latest.id)!.createdAt = new Date(60_000);
    const byId = (items: ChatListItem[]) => new Map(items.map((item) => [item.chat.id, item]));
    const listed = byId((await svc.listChats(COMMUNITY, PAGE, member)).rows);
    expect(listed.get(empty.id)?.lastMessage).toBeNull();
    expect(listed.get(group.id)?.lastMessage).toEqual({
      id: latest.id,
      orgUserId: member.id,
      body: 'Latest',
      createdAt: new Date(60_000),
      deletedAt: null,
    });
    await svc.deleteMessage(latest.id, member);
    const afterDelete = byId((await svc.listChats(COMMUNITY, PAGE, other)).rows).get(group.id);
    expect(afterDelete?.lastMessage).toMatchObject({ id: latest.id, body: '' });
    expect(afterDelete?.lastMessage?.deletedAt).toBeInstanceOf(Date);
    const staffSees = byId((await svc.listChats(COMMUNITY, PAGE, staff)).rows).get(group.id);
    expect(staffSees?.lastMessage).toMatchObject({ id: latest.id, body: 'Latest' });
  });

  it('serves an attachment to participants, to staff after deletion, and to staff while flagged', async () => {
    const { svc } = harness();
    const admin = actorWith({
      id: 'ou_admin',
      orgId: ORG,
      org: ['communities:read', 'communities:moderate'],
      orgRole: ADMIN,
    });
    const chat = await svc.startGroup(
      {
        communityId: COMMUNITY,
        orgUserIds: [other.id, staff.id],
      },
      member,
    );
    const sent = await svc.send(
      chat.id,
      {
        body: 'Look',
        replyToId: null,
        assetIds: ['asset_1'],
      },
      member,
    );
    const file = (actor: Actor, assetId = 'asset_1') =>
      svc.attachmentFile(chat.id, sent.id, assetId, actor);

    expect(await file(other)).toBe('https://signed');
    await expect(file(other, 'asset_other')).rejects.toThrow(NotFoundError);
    await expect(file(third)).rejects.toThrow(NotFoundError);
    await expect(file(moderator)).rejects.toThrow(NotFoundError);
    await expect(svc.attachmentFile('chat_missing', sent.id, 'asset_1', other)).rejects.toThrow(
      NotFoundError,
    );

    await expect(file(admin)).rejects.toThrow(NotFoundError);
    await svc.flagMessage(sent.id, 'spam', other);
    await expect(file(moderator)).rejects.toThrow(NotFoundError);
    expect(await file(admin)).toBe('https://signed');

    await svc.deleteMessage(sent.id, member);
    await expect(file(other)).rejects.toThrow(NotFoundError);
    expect(await file(staff)).toBe('https://signed');
  });
});

describe('message mentions', () => {
  const mentionedIn = (event: NewDomainEvent | undefined) =>
    (event?.data as { mentionedOrgUserIds?: string[] } | undefined)?.mentionedOrgUserIds;

  async function group() {
    const h = harness();
    const chat = await h.svc.startGroup(
      {
        communityId: COMMUNITY,
        orgUserIds: [other.id, third.id, fourth.id],
      },
      member,
    );
    await h.svc.leave(chat.id, fourth);
    return { ...h, chat };
  }

  it('keeps the participants still in the chat and carries them on the sent event', async () => {
    const { svc, calls, mentions, chat } = await group();
    const sent = await svc.send(
      chat.id,
      messageInput('<@ou_other> <@ou_fourth> <@ou_out> <@ou_other>'),
      member,
    );
    const event = calls
      .flat()
      .filter((row) => row.type === 'discussion.message.sent')
      .at(-1);
    expect(mentionedIn(event)).toEqual([other.id]);
    expect(mentions.rows.map((row) => [row.itemId, row.orgUserId])).toEqual([[sent.id, other.id]]);
    expect(sent.mentions).toEqual([{ orgUserId: other.id, name: other.id }]);
  });

  it('carries the mentions of the first message of a direct chat', async () => {
    const { svc, calls } = harness({ settings: { firstMessageIsRequest: false } });
    await svc.startDirect(
      {
        communityId: COMMUNITY,
        orgUserId: other.id,
        body: 'hey <@ou_other> <@ou_third>',
        assetIds: [],
      },
      member,
    );
    const event = calls.flat().find((row) => row.type === 'discussion.message.sent');
    expect(mentionedIn(event)).toEqual([other.id]);
  });

  it('replaces the mentions on an edit and drops them with the deleted message', async () => {
    const { svc, mentions, chat } = await group();
    const sent = await svc.send(chat.id, messageInput('hi <@ou_other>'), member);
    const edited = await svc.editMessage(sent.id, 'hi <@ou_third>', member);
    expect(edited.mentions).toEqual([{ orgUserId: third.id, name: third.id }]);
    expect(mentions.rows.map((row) => row.orgUserId)).toEqual([third.id]);
    const deleted = await svc.deleteMessage(sent.id, member);
    expect(deleted.mentions).toEqual([]);
    expect(mentions.rows).toEqual([]);
  });
});

describe('message events', () => {
  const dataOfLast = (calls: NewDomainEvent[][], type: string) =>
    calls
      .flat()
      .filter((row) => row.type === type)
      .at(-1)?.data as Record<string, unknown> | undefined;

  it('announces only a person’s first reaction as added, and every change as changed', async () => {
    const h = harness({ settings: { firstMessageIsRequest: false } });
    const chat = await h.svc.startDirect(
      {
        communityId: COMMUNITY,
        orgUserId: other.id,
        body: null,
        assetIds: [],
      },
      member,
    );
    const sent = await h.svc.send(chat.id, messageInput('hi'), member);
    h.calls.length = 0;
    await h.svc.setReaction(sent.id, '👍', other);
    await h.svc.setReaction(sent.id, '👍', other);
    await h.svc.setReaction(sent.id, '🎉', other);
    await h.svc.setReaction(sent.id, null, other);
    await h.svc.setReaction(sent.id, null, other);
    const where = {
      messageId: sent.id,
      chatId: chat.id,
      communityId: COMMUNITY,
      orgUserId: other.id,
    };
    expect(h.calls.flat().map((event) => [event.type, event.data])).toEqual([
      ['discussion.message.reaction.added', { ...where, reaction: '👍' }],
      ['discussion.message.reactions.changed', { ...where, reaction: '👍' }],
      ['discussion.message.reactions.changed', { ...where, reaction: '🎉' }],
      ['discussion.message.reactions.changed', { ...where, reaction: null }],
    ]);
  });

  it('leaves the client id out of message event data', async () => {
    const h = harness({ settings: { firstMessageIsRequest: false } });
    const chat = await h.svc.startGroup(
      { communityId: COMMUNITY, orgUserIds: [other.id, third.id] },
      member,
    );
    const sent = await h.svc.send(
      chat.id,
      { ...messageInput('hi'), clientId: '0f6c3a52-8f1e-4d8a-9a3b-4f1b2c3d4e5f' },
      member,
    );
    expect(sent.clientId).toBe('0f6c3a52-8f1e-4d8a-9a3b-4f1b2c3d4e5f');
    await h.svc.editMessage(sent.id, 'hello', member);
    await h.svc.deleteMessage(sent.id, member);
    const messageEvents = h.calls
      .flat()
      .filter((event) => event.type.startsWith('discussion.message.'));
    expect(messageEvents.map((event) => event.type)).toEqual([
      'discussion.message.sent',
      'discussion.message.updated',
      'discussion.message.deleted',
    ]);
    for (const event of messageEvents) {
      expect(dataOf(event)).not.toHaveProperty('clientId');
    }
  });

  it('announces an edit with the people it newly mentions', async () => {
    const h = harness();
    const chat = await h.svc.startGroup(
      {
        communityId: COMMUNITY,
        orgUserIds: [other.id, third.id],
      },
      member,
    );
    const sent = await h.svc.send(chat.id, messageInput('hi <@ou_other>'), member);
    await h.svc.editMessage(sent.id, 'hi <@ou_other> <@ou_third> <@ou_out>', member);
    expect(dataOfLast(h.calls, 'discussion.message.updated')).toMatchObject({
      id: sent.id,
      body: 'hi <@ou_other> <@ou_third> <@ou_out>',
      mentionedOrgUserIds: [third.id],
    });
    expect(
      h.calls
        .flat()
        .filter((row) => row.type === 'discussion.message.updated')
        .at(-1)?.metadata,
    ).toEqual({ actorOrgUserId: member.id, chatStatus: 'open' });
    await h.svc.editMessage(sent.id, 'hi <@ou_third>', member);
    expect(dataOfLast(h.calls, 'discussion.message.updated')?.mentionedOrgUserIds).toEqual([]);
  });
});

describe('unread in a chat', () => {
  it('counts the messages after the read marker that others sent, with the latest', async () => {
    const { svc, messages } = harness();
    const chat = await svc.startGroup(
      {
        communityId: COMMUNITY,
        orgUserIds: [other.id, third.id],
      },
      member,
    );
    const sent = [
      await svc.send(chat.id, messageInput('one'), other),
      await svc.send(chat.id, messageInput('mine'), member),
      await svc.send(chat.id, messageInput('two'), third),
      await svc.send(chat.id, messageInput('three'), other),
    ];
    sent.forEach((message, index) => {
      messages.find((row) => row.id === message.id)!.createdAt = new Date(index * 60_000);
    });
    expect(await svc.unreadInChat(ORG, chat.id, member.id)).toEqual({
      count: 3,
      latest: { messageId: sent[3]!.id, senderOrgUserId: other.id, body: 'three' },
    });
    await svc.markRead(chat.id, sent[2]!.id, member);
    expect(await svc.unreadInChat(ORG, chat.id, member.id)).toEqual({
      count: 1,
      latest: { messageId: sent[3]!.id, senderOrgUserId: other.id, body: 'three' },
    });
    await svc.markRead(chat.id, sent[3]!.id, member);
    expect(await svc.unreadInChat(ORG, chat.id, member.id)).toEqual({ count: 0, latest: null });
    expect((await svc.unreadInChat(ORG, chat.id, other.id)).count).toBe(2);
  });
});

describe('chat moderation on communities:moderate', () => {
  async function room(communityId = COMMUNITY) {
    const h = harness({ settings: { firstMessageIsRequest: false } });
    const chat = await h.svc.startGroup(
      { communityId, orgUserIds: [other.id, emma.id, moderator.id] },
      member,
    );
    const sent = await h.svc.send(
      chat.id,
      { body: 'Look <@ou_other>', replyToId: null, assetIds: ['asset_1'] },
      member,
    );
    return { ...h, chat, sent };
  }

  it('lets a moderator of the community delete another person’s message', async () => {
    const { svc, sent } = await room();
    await expect(svc.deleteMessage(sent.id, other)).rejects.toThrow(
      'You cannot delete this message',
    );
    await expect(svc.deleteMessage(sent.id, moderator)).rejects.toThrow(
      'You cannot delete this message',
    );
    expect((await svc.deleteMessage(sent.id, emma)).deletedAt).toBeInstanceOf(Date);
  });

  it('refuses a moderator of the community deleting a message in another community', async () => {
    const { svc, sent } = await room('cmy_2');
    await expect(svc.deleteMessage(sent.id, emma)).rejects.toThrow(
      'You cannot delete this message',
    );
    expect((await svc.deleteMessage(sent.id, moderator)).deletedAt).toBeInstanceOf(Date);
  });

  it('shows a deleted message’s body and attachments only to a moderator there', async () => {
    const { svc, chat, sent } = await room();
    await svc.deleteMessage(sent.id, member);
    const seen = async (actor: Actor) =>
      (await svc.messages(chat.id, PAGE, actor)).rows.find((row) => row.id === sent.id);
    expect(await seen(emma)).toMatchObject({
      body: 'Look <@ou_other>',
      attachments: [{ assetId: 'asset_1' }],
    });
    for (const actor of [other, moderator]) {
      expect(await seen(actor)).toMatchObject({ body: '', attachments: [], mentions: [] });
    }
    const last = async (actor: Actor) =>
      (await svc.listChats(COMMUNITY, PAGE, actor)).rows.find((row) => row.chat.id === chat.id)
        ?.lastMessage?.body;
    expect(await last(emma)).toBe('Look <@ou_other>');
    expect(await last(other)).toBe('');
    expect(await last(moderator)).toBe('');
    expect(await svc.attachmentFile(chat.id, sent.id, 'asset_1', emma)).toBe('https://signed');
    await expect(svc.attachmentFile(chat.id, sent.id, 'asset_1', moderator)).rejects.toThrow(
      NotFoundError,
    );
  });

  it('serves a flagged attachment to a moderator of the community who is not in the chat', async () => {
    const h = harness({ settings: { firstMessageIsRequest: false } });
    const chat = await h.svc.startGroup(
      { communityId: COMMUNITY, orgUserIds: [other.id, third.id] },
      member,
    );
    const sent = await h.svc.send(
      chat.id,
      { body: 'Look', replyToId: null, assetIds: ['asset_1'] },
      member,
    );
    await expect(h.svc.attachmentFile(chat.id, sent.id, 'asset_1', emma)).rejects.toThrow(
      NotFoundError,
    );
    await h.svc.flagMessage(sent.id, 'spam', other);
    expect(await h.svc.attachmentFile(chat.id, sent.id, 'asset_1', emma)).toBe('https://signed');
    await expect(h.svc.attachmentFile(chat.id, sent.id, 'asset_1', moderator)).rejects.toThrow(
      NotFoundError,
    );
    await expect(h.svc.attachmentFile(chat.id, sent.id, 'asset_1', fourth)).rejects.toThrow(
      NotFoundError,
    );
  });

  it('lets only a moderator of the community lock, unlock, resolve flags and read the queue', async () => {
    const { svc, chat, sent, flags } = await room();
    await svc.flagMessage(sent.id, 'spam', other);
    for (const actor of [other, moderator]) {
      await expect(svc.lock(chat.id, null, actor)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(svc.unlock(chat.id, null, actor)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(
        svc.resolveMessageFlags(sent.id, 'dismissed', null, actor),
      ).rejects.toBeInstanceOf(ForbiddenError);
      await expect(svc.messageQueue(COMMUNITY, actor)).rejects.toBeInstanceOf(ForbiddenError);
    }
    expect((await svc.messageQueue(COMMUNITY, emma)).entries).toHaveLength(1);
    await svc.resolveMessageFlags(sent.id, 'dismissed', COMMUNITY, emma);
    expect(flags[0]).toMatchObject({ resolution: 'dismissed', resolvedBy: emma.id });
    expect((await svc.lock(chat.id, COMMUNITY, emma)).lockedAt).toBeInstanceOf(Date);
    expect((await svc.unlock(chat.id, null, emma)).lockedAt).toBeNull();
  });

  it('refuses a moderator of one community the queue and locks of another', async () => {
    const { svc, chat } = await room('cmy_2');
    await expect(svc.lock(chat.id, null, emma)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(svc.messageQueue('cmy_2', emma)).rejects.toBeInstanceOf(ForbiddenError);
    expect((await svc.lock(chat.id, null, moderator)).lockedAt).toBeInstanceOf(Date);
    await expect(svc.messageQueue('cmy_2', moderator)).resolves.toBeDefined();
  });
});

describe('direct message rules on team', () => {
  const direct = (orgUserId: string, communityId = COMMUNITY) => ({
    communityId,
    orgUserId,
    body: 'Hello',
    assetIds: [],
  });

  it('applies memberToMember between two members', async () => {
    const { svc } = harness({ settings: { memberToMember: false } });
    await expect(svc.startDirect(direct(other.id), member)).rejects.toThrow(
      'You cannot message this person',
    );
    await expect(svc.startDirect(direct(emma.id), member)).resolves.toBeDefined();
  });

  it('applies memberToTeam from a member to someone who is team in the community', async () => {
    const { svc } = harness({ settings: { memberToTeam: false } });
    await expect(svc.startDirect(direct(emma.id), member)).rejects.toThrow(
      'You cannot message this person',
    );
    await expect(svc.startDirect(direct(other.id), member)).resolves.toBeDefined();
    await expect(svc.startDirect(direct(emma.id, 'cmy_2'), member)).resolves.toBeDefined();
  });

  it('applies teamToAnyone from someone who is team in the community', async () => {
    const { svc } = harness({ settings: { teamToAnyone: false } });
    await expect(svc.startDirect(direct(member.id), emma)).rejects.toThrow(
      'You cannot message this person',
    );
    await expect(svc.startDirect(direct(emma.id), member)).resolves.toBeDefined();
    await expect(svc.startDirect(direct(member.id, 'cmy_2'), emma)).resolves.toBeDefined();
  });

  it('treats Emma as team in Spring cohort: a first DM to or from her is not a request', async () => {
    const { svc } = harness();
    expect((await svc.startDirect(direct(emma.id), member)).status).toBe('open');
    expect((await svc.startDirect(direct(other.id), emma)).status).toBe('open');
    expect((await svc.startDirect(direct(other.id), member)).status).toBe('pending');
  });

  it('treats Emma as a member in a community where she holds nothing', async () => {
    const { svc } = harness();
    expect((await svc.startDirect(direct(emma.id, 'cmy_2'), member)).status).toBe('pending');
    expect((await svc.startDirect(direct(other.id, 'cmy_2'), emma)).status).toBe('pending');
  });

  it('shows the sender’s team badge and role name on the chat’s community', async () => {
    const { svc } = harness({ settings: { firstMessageIsRequest: false } });
    const badge = async (sender: Actor, communityId: string) => {
      const chat = await svc.startDirect(direct(third.id, communityId), sender);
      const sent = await svc.send(chat.id, messageInput('Hi'), sender);
      return { team: sent.sender.team, roleName: sent.sender.roleName };
    };
    expect(await badge(emma, COMMUNITY)).toEqual({ team: true, roleName: 'Moderator' });
    expect(await badge(emma, 'cmy_2')).toEqual({ team: false, roleName: null });
    expect(await badge(member, COMMUNITY)).toEqual({ team: false, roleName: null });
    expect(await badge(staff, COMMUNITY)).toEqual({ team: true, roleName: 'Admin' });
  });
});

describe('read marks', () => {
  it('moves the read mark only forward and records each move once', async () => {
    const h = harness({ settings: { firstMessageIsRequest: false } });
    const chat = await h.svc.startGroup(
      { communityId: COMMUNITY, orgUserIds: [other.id, third.id] },
      member,
    );
    const first = await h.svc.send(chat.id, messageInput('one'), other);
    const second = await h.svc.send(chat.id, messageInput('two'), other);
    h.messages.find((row) => row.id === first.id)!.createdAt = new Date(1000);
    h.messages.find((row) => row.id === second.id)!.createdAt = new Date(2000);
    h.calls.length = 0;
    await h.svc.markRead(chat.id, second.id, member);
    await h.svc.markRead(chat.id, first.id, member);
    await h.svc.markRead(chat.id, second.id, member);
    expect(h.users.find((user) => user.orgUserId === member.id)?.lastReadMessageId).toBe(second.id);
    expect(h.calls.flat().map((event) => [event.type, event.data])).toEqual([
      [
        'discussion.chat.read',
        {
          chatId: chat.id,
          communityId: COMMUNITY,
          orgUserId: member.id,
          lastReadMessageId: second.id,
        },
      ],
    ]);
  });
});

describe('client ids', () => {
  const CLIENT_ID = '7d3b9f2e-1c4a-4b5d-8e6f-0a1b2c3d4e5f';

  async function room() {
    const h = harness({ settings: { firstMessageIsRequest: false } });
    const chat = await h.svc.startGroup(
      { communityId: COMMUNITY, orgUserIds: [other.id, third.id] },
      member,
    );
    h.calls.length = 0;
    return { ...h, chat };
  }

  it('returns the stored message for a repeat send and records nothing', async () => {
    const h = await room();
    const first = await h.svc.send(
      h.chat.id,
      { ...messageInput('hi'), clientId: CLIENT_ID },
      member,
    );
    const repeat = await h.svc.send(
      h.chat.id,
      { ...messageInput('hi again'), clientId: CLIENT_ID },
      member,
    );
    expect(repeat.id).toBe(first.id);
    expect(repeat.body).toBe('hi');
    expect(h.messages).toHaveLength(1);
    expect(h.calls.flat().map((event) => event.type)).toEqual(['discussion.message.sent']);
  });

  it('treats the same client id from another member as a new message', async () => {
    const h = await room();
    const mine = await h.svc.send(
      h.chat.id,
      { ...messageInput('hi'), clientId: CLIENT_ID },
      member,
    );
    const theirs = await h.svc.send(
      h.chat.id,
      { ...messageInput('hey'), clientId: CLIENT_ID },
      other,
    );
    expect(theirs.id).not.toBe(mine.id);
    expect(h.messages).toHaveLength(2);
  });

  it('returns the winner’s message to the send that lost the race to the unique index', async () => {
    const h = await room();
    const first = await h.svc.send(
      h.chat.id,
      { ...messageInput('hi'), clientId: CLIENT_ID },
      member,
    );
    h.race.missClientId = true;
    const loser = await h.svc.send(
      h.chat.id,
      { ...messageInput('hi'), clientId: CLIENT_ID },
      member,
    );
    expect(loser.id).toBe(first.id);
    expect(h.messages).toHaveLength(1);
    expect(h.calls.flat().map((event) => event.type)).toEqual(['discussion.message.sent']);
  });
});

describe('chat reads for one chat', () => {
  it('lists each chat with its active participants’ profiles', async () => {
    const h = harness();
    const chat = await h.svc.startGroup(
      { communityId: COMMUNITY, orgUserIds: [other.id, emma.id] },
      member,
    );
    await h.svc.addParticipant(chat.id, third.id, member);
    await h.svc.leave(chat.id, other);
    const [item] = (await h.svc.listChats(COMMUNITY, PAGE, member)).rows;
    expect(item?.participantIds).toEqual([emma.id, member.id, third.id].sort());
    expect(item?.participants.map((person) => person.id)).toEqual(item?.participantIds);
    expect(item?.participants.find((person) => person.id === emma.id)).toMatchObject({
      team: true,
      roleName: 'Moderator',
    });
    expect(item?.participants.find((person) => person.id === member.id)).toMatchObject({
      displayName: 'Sarah',
      team: false,
    });
  });

  it('lists only the pending requests to the member, or everything else', async () => {
    const h = harness();
    const request = await h.svc.startDirect(
      { communityId: COMMUNITY, orgUserId: member.id, body: 'Hi', assetIds: [] },
      other,
    );
    const group = await h.svc.startGroup(
      { communityId: COMMUNITY, orgUserIds: [other.id, third.id] },
      member,
    );
    const ids = async (actor: Actor, requests?: boolean) =>
      (
        await h.svc.listChats(
          COMMUNITY,
          requests === undefined ? PAGE : { ...PAGE, requests },
          actor,
        )
      ).rows
        .map((row) => row.chat.id)
        .sort();
    expect(await ids(member, true)).toEqual([request.id]);
    expect(await ids(member, false)).toEqual([group.id]);
    expect(await ids(member)).toEqual([request.id, group.id].sort());
    expect(await ids(other, true)).toEqual([]);
  });

  it('reads one chat for an active participant only', async () => {
    const h = harness({ settings: { firstMessageIsRequest: false } });
    const chat = await h.svc.startGroup(
      { communityId: COMMUNITY, orgUserIds: [other.id, third.id] },
      member,
    );
    await h.svc.send(chat.id, messageInput('hi'), other);
    const item = await h.svc.chat(chat.id, member);
    expect(item).toMatchObject({
      chat: { id: chat.id },
      unread: 1,
      subscription: null,
      lastMessage: { body: 'hi' },
    });
    expect(item.participants).toHaveLength(3);
    await expect(h.svc.chat(chat.id, fourth)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(h.svc.chat('cht_missing', member)).rejects.toBeInstanceOf(NotFoundError);
    h.dropMember(member.id);
    await expect(h.svc.chat(chat.id, member)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('finds the direct chat with a member, and none once the member left it', async () => {
    const h = harness({ settings: { firstMessageIsRequest: false } });
    await expect(h.svc.directChat(COMMUNITY, other.id, member)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    const chat = await h.svc.startDirect(
      { communityId: COMMUNITY, orgUserId: other.id, body: null, assetIds: [] },
      member,
    );
    expect((await h.svc.directChat(COMMUNITY, other.id, member)).chat.id).toBe(chat.id);
    expect((await h.svc.directChat(COMMUNITY, member.id, other)).chat.id).toBe(chat.id);
    await expect(h.svc.directChat(COMMUNITY, member.id, member)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await h.svc.leave(chat.id, member);
    await expect(h.svc.directChat(COMMUNITY, other.id, member)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(h.svc.directChat(COMMUNITY, member.id, outsider)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it('totals unread across chats that are neither muted nor requests, plus the requests', async () => {
    const h = harness({ settings: { firstMessageIsRequest: false } });
    const group = await h.svc.startGroup(
      { communityId: COMMUNITY, orgUserIds: [other.id, third.id] },
      member,
    );
    const muted = await h.svc.startGroup(
      { communityId: COMMUNITY, orgUserIds: [other.id, fourth.id] },
      member,
    );
    await h.svc.send(group.id, messageInput('one'), other);
    await h.svc.send(group.id, messageInput('two'), third);
    await h.svc.send(muted.id, messageInput('quiet'), other);
    await h.subscriptions.repo.upsert(ORG, {
      orgId: ORG,
      orgUserId: member.id,
      itemType: 'chat',
      itemId: muted.id,
      state: 'muted',
      mutedUntil: null,
      createdAt: new Date(),
    });
    expect(await h.svc.unreadSummary(COMMUNITY, member)).toEqual({ unread: 2, requests: 0 });
    const strict = harness();
    await strict.svc.startDirect(
      { communityId: COMMUNITY, orgUserId: member.id, body: 'Hi', assetIds: [] },
      other,
    );
    expect(await strict.svc.unreadSummary(COMMUNITY, member)).toEqual({
      unread: 1,
      requests: 1,
    });
    await expect(h.svc.unreadSummary(COMMUNITY, outsider)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('serves message views without a viewer reaction or a deleted message’s body', async () => {
    const h = harness({ settings: { firstMessageIsRequest: false } });
    const chat = await h.svc.startGroup(
      { communityId: COMMUNITY, orgUserIds: [other.id, third.id] },
      member,
    );
    const kept = await h.svc.send(chat.id, messageInput('kept'), member);
    const gone = await h.svc.send(
      chat.id,
      { body: 'gone <@ou_other>', replyToId: null, assetIds: ['ast_1'] },
      member,
    );
    await h.svc.setReaction(kept.id, '👍', other);
    await h.svc.deleteMessage(gone.id, member);
    const views = await h.svc.messageViews(ORG, [kept.id, gone.id]);
    const byId = new Map(views.map((view) => [view.id, view]));
    expect(byId.get(kept.id)).toMatchObject({ body: 'kept', reactions: { '👍': 1 } });
    expect(byId.get(gone.id)).toMatchObject({ body: '', attachments: [], mentions: [] });
    for (const view of views) {
      expect(view).not.toHaveProperty('viewerReaction');
    }
  });
});

describe('typing and live streams', () => {
  function recordingPubSub() {
    const published: JsonValue[] = [];
    const pubsub: PubSub = {
      async publish(_channel, message) {
        published.push(message);
      },
      subscribe: () => () => {},
      async start() {},
      async stop() {},
    };
    return { pubsub, published };
  }

  it('publishes typing for an active participant and drops a repeat within 2 s', async () => {
    const { pubsub, published } = recordingPubSub();
    const h = harness({ settings: { firstMessageIsRequest: false }, pubsub });
    const chat = await h.svc.startGroup(
      { communityId: COMMUNITY, orgUserIds: [other.id, third.id] },
      member,
    );
    await h.svc.typing(chat.id, member);
    await h.svc.typing(chat.id, member);
    await h.svc.typing(chat.id, other);
    expect(published).toEqual([
      expect.objectContaining({
        event: 'typing',
        orgId: ORG,
        communityId: COMMUNITY,
        chatId: chat.id,
        orgUserId: member.id,
      }),
      expect.objectContaining({ event: 'typing', orgUserId: other.id }),
    ]);
    const until = new Date((published[0] as { until: string }).until).getTime();
    expect(until - Date.now()).toBeGreaterThan(4000);
    expect(until - Date.now()).toBeLessThanOrEqual(5000);
    await expect(h.svc.typing(chat.id, fourth)).rejects.toBeInstanceOf(ForbiddenError);
    await h.svc.lock(chat.id, null, staff);
    await expect(h.svc.typing(chat.id, third)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('refuses a stream without a PubSub and to a non-member', async () => {
    const plain = harness();
    const session = { current: async () => ({ status: 'signed-out' as const }) };
    await expect(plain.svc.watch(COMMUNITY, session, member)).rejects.toBeInstanceOf(
      UnavailableError,
    );
    const { pubsub } = recordingPubSub();
    const live = harness({ pubsub });
    await expect(live.svc.watch(COMMUNITY, session, outsider)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    const stream = (await live.svc.watch(COMMUNITY, session, member))[Symbol.asyncIterator]();
    expect((await stream.next()).value).toEqual({ type: 'ready', heartbeatMs: 25_000 });
    await stream.return?.();
  });
});
