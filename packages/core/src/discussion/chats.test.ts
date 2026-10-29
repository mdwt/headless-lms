import { describe, expect, it } from 'vitest';
import { ForbiddenError, InvalidInputError, NotFoundError } from '../shared/errors.js';
import type { Actor } from '../shared/actor.js';
import type { NewDomainEvent } from '../shared/ports.js';
import type { DmSettings } from '../content/index.js';
import { isStaffRole } from '../organizations/index.js';
import type { CommunityAccessReader } from '../entitlements/index.js';
import type { AssetFiles, MemberImageReader } from '../assets/index.js';
import { createFileUrls } from '../assets/index.js';
import { ChatServiceImpl } from './chats.js';
import type {
  AuthorRoleReader,
  ChatListItem,
  ChatRepository,
  ChatUnitOfWork,
  SendMessageInput,
} from './ports.js';
import type { Chat, ChatUser, Message, MessageFlag, Page, Role } from '../types/index.js';

const dmSettings: DmSettings = {
  enabled: true,
  memberToMember: true,
  memberToStaff: true,
  staffToAnyone: true,
  firstMessageIsRequest: true,
  groupChats: true,
  groupSize: 8,
};

const ORG = 'org-1';
const COMMUNITY = 'cmy_1';

const member: Actor = { id: 'ou_member', role: 'student' };
const other: Actor = { id: 'ou_other', role: 'student' };
const third: Actor = { id: 'ou_third', role: 'student' };
const fourth: Actor = { id: 'ou_fourth', role: 'student' };
const moderator: Actor = { id: 'ou_mod', role: 'moderator' };
const staff: Actor = { id: 'ou_staff', role: 'instructor' };
const outsider: Actor = { id: 'ou_out', role: 'student' };

const roles: Record<string, Role> = {
  [member.id]: 'student',
  [other.id]: 'student',
  [third.id]: 'student',
  [fourth.id]: 'student',
  [moderator.id]: 'moderator',
  [staff.id]: 'instructor',
  [outsider.id]: 'student',
};

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
    options?.members ?? [member.id, other.id, third.id, fourth.id, moderator.id],
  );
  const settings = options?.settings === null ? null : { ...dmSettings, ...options?.settings };

  const pair = (a: string, b: string) => [a, b].sort().join(':');
  const queries = { isBlocked: 0, blockedWith: 0, anyBlockedAmong: 0 };

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
    async listForUser(orgId, communityId, orgUserId) {
      return chats
        .filter(
          (chat) =>
            chat.orgId === orgId &&
            chat.communityId === communityId &&
            users.some(
              (user) =>
                user.chatId === chat.id && user.orgUserId === orgUserId && user.leftAt === null,
            ),
        )
        .map((chat): ChatListItem => {
          const mine = users.find(
            (user) => user.chatId === chat.id && user.orgUserId === orgUserId,
          );
          const last = messages
            .filter((row) => row.chatId === chat.id)
            .sort(
              (a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1),
            )[0];
          return {
            chat: { ...chat },
            participantIds: users
              .filter((user) => user.chatId === chat.id && user.leftAt === null)
              .map((user) => user.orgUserId)
              .sort(),
            lastReadMessageId: mine?.lastReadMessageId ?? null,
            muted: mine?.muted ?? false,
            mutedUntil: mine?.mutedUntil ?? null,
            unread: 0,
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
        });
    },
    async participants(orgId, chatId) {
      return users
        .filter((user) => user.orgId === orgId && user.chatId === chatId)
        .map((user) => ({ ...user }));
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
      if (user) {
        user.lastReadMessageId = messageId;
      }
    },
    async setMuted(orgId, chatId, orgUserId, muted, mutedUntil) {
      const user = users.find(
        (row) => row.orgId === orgId && row.chatId === chatId && row.orgUserId === orgUserId,
      );
      if (user) {
        user.muted = muted;
        user.mutedUntil = mutedUntil;
      }
    },
    async insertMessage(_orgId, message) {
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
      if (index >= 0) {
        reactions.splice(index, 1);
      }
      if (emoji !== null) {
        reactions.push({ messageId, orgUserId, emoji });
      }
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
    async listOpenFlags(orgId, communityId) {
      return flags
        .filter(
          (flag) => flag.orgId === orgId && flag.communityId === communityId && !flag.resolvedAt,
        )
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

  const access = {
    async isCommunityMember(_orgId: string, actor: Actor, _communityId: string) {
      if (isStaffRole(actor.role)) {
        return true;
      }
      return members.has(actor.id);
    },
    async communityMembersAmong(_orgId: string, _communityId: string, orgUserIds: string[]) {
      return orgUserIds.filter((id) => isStaffRole(roles[id] ?? 'student') || members.has(id));
    },
  } as CommunityAccessReader;

  const authors: AuthorRoleReader = {
    async roleOf(_orgId, orgUserId) {
      return roles[orgUserId] ?? null;
    },
    async rolesOf(_orgId, orgUserIds) {
      return Object.fromEntries(orgUserIds.flatMap((id) => (roles[id] ? [[id, roles[id]!]] : [])));
    },
  };

  const uow: ChatUnitOfWork = {
    run: (fn) =>
      fn({
        chats: repo,
        outbox: {
          async append(events: NewDomainEvent[]) {
            calls.push(events);
          },
        },
      }),
  };

  const svc = new ChatServiceImpl({
    repo,
    access,
    content: {
      async getSpace() {
        return null;
      },
      async listSpaces() {
        return [];
      },
      async getDmSettings(_orgId, communityId) {
        if (settings === null) {
          return null;
        }
        if (communityId !== COMMUNITY && communityId !== 'cmy_2') {
          return null;
        }
        return settings;
      },
    },
    authors,
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
              role: roles[id] ?? 'student',
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
    images: {
      signFile: async () => 'https://signed',
      ...(options?.images ?? { ownsImage: async () => true }),
    },
    fileUrls,
    uow,
  });

  return {
    svc,
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
  it('starts a direct chat as a request with its message and records the chat once', async () => {
    const { svc, calls } = harness();
    const chat = await svc.startDirect(ORG, member, {
      communityId: COMMUNITY,
      orgUserId: other.id,
      body: 'Hello',
      assetIds: [],
    });
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
      svc.startDirect(ORG, member, {
        communityId: COMMUNITY,
        orgUserId: other.id,
        body: null,
        assetIds: [],
      }),
    ).rejects.toThrow('A message request needs a message');
    expect(chats).toHaveLength(0);
    expect(calls).toHaveLength(0);
  });

  it('sends the first message in the same transaction as the new chat', async () => {
    const { svc, calls, attachments } = harness();
    const chat = await svc.startDirect(ORG, member, {
      communityId: COMMUNITY,
      orgUserId: other.id,
      body: 'Hello',
      assetIds: ['ast_1'],
    });
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
      svc.startDirect(ORG, member, {
        communityId: COMMUNITY,
        orgUserId: other.id,
        body: 'Hello',
        assetIds: ['ast_paid'],
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
    const chat = await svc.startDirect(ORG, member, {
      communityId: COMMUNITY,
      orgUserId: other.id,
      body: 'Hello',
      assetIds: [],
    });
    await expect(
      svc.send(ORG, member, chat.id, { body: 'File', replyToId: null, assetIds: ['ast_paid'] }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(attachments).toEqual([]);
  });

  it('returns the existing direct chat and writes a new body into it', async () => {
    const { svc, calls, messages } = harness();
    const input = { communityId: COMMUNITY, orgUserId: other.id, body: 'Again', assetIds: [] };
    const first = await svc.startDirect(ORG, member, input);
    const quiet = await svc.startDirect(ORG, member, { ...input, body: null });
    expect(quiet.id).toBe(first.id);
    expect(calls).toHaveLength(1);
    const second = await svc.startDirect(ORG, other, { ...input, orgUserId: member.id });
    expect(second.id).toBe(first.id);
    expect(calls[1]?.map((event) => event.type)).toEqual([
      'discussion.chat.updated',
      'discussion.message.sent',
    ]);
    expect(
      messages.some((message) => message.orgUserId === other.id && message.body === 'Again'),
    ).toBe(true);
    const elsewhere = await svc.startDirect(ORG, member, { ...input, communityId: 'cmy_2' });
    expect(elsewhere.id).not.toBe(first.id);
  });

  it('opens a direct chat when the first message is not a request', async () => {
    const { svc } = harness({ settings: { firstMessageIsRequest: false } });
    const chat = await svc.startDirect(ORG, member, {
      communityId: COMMUNITY,
      orgUserId: other.id,
      body: null,
      assetIds: [],
    });
    expect(chat.status).toBe('open');
  });

  it('refuses a direct chat the settings or the membership do not allow', async () => {
    const { svc } = harness();
    await expect(
      svc.startDirect(ORG, member, {
        communityId: COMMUNITY,
        orgUserId: member.id,
        body: null,
        assetIds: [],
      }),
    ).rejects.toBeInstanceOf(InvalidInputError);
    await expect(
      svc.startDirect(ORG, outsider, {
        communityId: COMMUNITY,
        orgUserId: other.id,
        body: null,
        assetIds: [],
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      svc.startDirect(ORG, member, {
        communityId: 'cmy_missing',
        orgUserId: other.id,
        body: null,
        assetIds: [],
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
    const off = harness({ settings: null });
    await expect(
      off.svc.startDirect(ORG, member, {
        communityId: COMMUNITY,
        orgUserId: other.id,
        body: null,
        assetIds: [],
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
    const closed = harness({ settings: { memberToMember: false } });
    await expect(
      closed.svc.startDirect(ORG, member, {
        communityId: COMMUNITY,
        orgUserId: other.id,
        body: null,
        assetIds: [],
      }),
    ).rejects.toThrow('You cannot message this person');
    const disabled = harness({ settings: { enabled: false } });
    await expect(
      disabled.svc.startDirect(ORG, staff, {
        communityId: COMMUNITY,
        orgUserId: member.id,
        body: null,
        assetIds: [],
      }),
    ).rejects.toThrow('Direct messages are off');
  });

  it('starts a group chat open and addresses each added person', async () => {
    const { svc, calls } = harness();
    const chat = await svc.startGroup(ORG, member, {
      communityId: COMMUNITY,
      orgUserIds: [other.id, third.id, member.id],
    });
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
      svc.startGroup(ORG, member, { communityId: COMMUNITY, orgUserIds: [other.id] }),
    ).rejects.toThrow('A group chat needs three people');
    const small = harness({ settings: { groupSize: 2 } });
    await expect(
      small.svc.startGroup(ORG, member, {
        communityId: COMMUNITY,
        orgUserIds: [other.id, third.id],
      }),
    ).rejects.toThrow('This group is full');
    const noGroups = harness({ settings: { groupChats: false } });
    await expect(
      noGroups.svc.startGroup(ORG, member, {
        communityId: COMMUNITY,
        orgUserIds: [other.id, third.id],
      }),
    ).rejects.toThrow('Group chats are off');
  });

  it('refuses every creator send while a request is pending and opens it on a reply', async () => {
    const { svc, calls, chats } = harness();
    const chat = await svc.startDirect(ORG, member, {
      communityId: COMMUNITY,
      orgUserId: other.id,
      body: 'First',
      assetIds: [],
    });
    await expect(svc.accept(ORG, member, chat.id)).rejects.toThrow(
      'You cannot accept this request',
    );
    const before = calls.length;
    await expect(svc.send(ORG, member, chat.id, messageInput('No'))).rejects.toThrow(
      'You cannot send in this chat',
    );
    await expect(
      svc.startDirect(ORG, member, {
        communityId: COMMUNITY,
        orgUserId: other.id,
        body: 'Again',
        assetIds: [],
      }),
    ).rejects.toThrow('You cannot send in this chat');
    expect(calls).toHaveLength(before);
    expect(chats.find((row) => row.id === chat.id)?.status).toBe('pending');
    const sent = await svc.send(ORG, other, chat.id, messageInput('Hello'));
    expect(sent.communityId).toBe(COMMUNITY);
    expect(chats.find((row) => row.id === chat.id)?.status).toBe('open');
    expect(calls.at(-1)?.map((event) => event.type)).toEqual([
      'discussion.chat.updated',
      'discussion.message.sent',
    ]);
    expect(calls.at(-1)?.[0]?.metadata).toEqual({ actorOrgUserId: other.id });
    expect(calls.at(-1)?.[1]?.metadata).toEqual({ actorOrgUserId: other.id, chatStatus: 'open' });
    await expect(svc.accept(ORG, other, chat.id)).rejects.toThrow('This chat is not a request');
    await svc.send(ORG, member, chat.id, messageInput('Hi'));
  });

  it('blocks a direct chat in this community without telling the blocked person', async () => {
    const { svc, calls } = harness({ settings: { firstMessageIsRequest: false } });
    const chat = await svc.startDirect(ORG, member, {
      communityId: COMMUNITY,
      orgUserId: other.id,
      body: null,
      assetIds: [],
    });
    const elsewhere = await svc.startDirect(ORG, member, {
      communityId: 'cmy_2',
      orgUserId: other.id,
      body: null,
      assetIds: [],
    });
    const before = calls.length;
    await svc.block(ORG, member, COMMUNITY, other.id);
    expect(calls).toHaveLength(before);
    const seen = (await svc.listChats(ORG, other, COMMUNITY)).find(
      (item) => item.chat.id === chat.id,
    );
    expect(seen?.chat.status).toBe('open');
    await expect(svc.send(ORG, other, chat.id, messageInput('Hey'))).rejects.toThrow(
      'You cannot send in this chat',
    );
    await expect(
      svc.startDirect(ORG, other, {
        communityId: COMMUNITY,
        orgUserId: member.id,
        body: 'Hey',
        assetIds: [],
      }),
    ).rejects.toThrow('You cannot send in this chat');
    await expect(svc.send(ORG, member, chat.id, messageInput('Hey'))).rejects.toThrow(
      'You cannot send in this chat',
    );
    await svc.send(ORG, member, elsewhere.id, messageInput('Still here'));
    await svc.unblock(ORG, member, COMMUNITY, other.id);
    expect(calls.at(-1)?.map((event) => event.type)).toEqual(['discussion.message.sent']);
    await svc.send(ORG, member, chat.id, messageInput('Back'));
  });

  it('refuses a blocked person a new chat with the ordinary refusal', async () => {
    const { svc } = harness({ settings: { firstMessageIsRequest: false } });
    await svc.block(ORG, member, COMMUNITY, other.id);
    await expect(
      svc.startDirect(ORG, other, {
        communityId: COMMUNITY,
        orgUserId: member.id,
        body: 'Hello',
        assetIds: [],
      }),
    ).rejects.toThrow('You cannot message this person');
    await expect(
      svc.startGroup(ORG, other, { communityId: COMMUNITY, orgUserIds: [member.id, third.id] }),
    ).rejects.toThrow('You cannot message this person');
  });

  it('keeps a locked direct chat locked when the block is lifted', async () => {
    const { svc } = harness({ settings: { firstMessageIsRequest: false } });
    const chat = await svc.startDirect(ORG, member, {
      communityId: COMMUNITY,
      orgUserId: other.id,
      body: null,
      assetIds: [],
    });
    await svc.lock(ORG, staff, chat.id);
    await svc.block(ORG, member, COMMUNITY, other.id);
    await svc.unblock(ORG, member, COMMUNITY, other.id);
    await expect(svc.send(ORG, member, chat.id, messageInput('No'))).rejects.toThrow(
      'This chat is locked',
    );
    await svc.unlock(ORG, staff, chat.id);
    await svc.send(ORG, member, chat.id, messageInput('Yes'));
  });

  it('stops only the blocked pair from sending in a group', async () => {
    const { svc } = harness();
    const chat = await svc.startGroup(ORG, member, {
      communityId: COMMUNITY,
      orgUserIds: [other.id, third.id],
    });
    await svc.block(ORG, member, COMMUNITY, other.id);
    const stored = await svc.listChats(ORG, third, COMMUNITY);
    expect(stored[0]?.chat.status).toBe('open');
    await expect(svc.send(ORG, member, chat.id, messageInput('No'))).rejects.toThrow(
      'You cannot send in this chat',
    );
    await svc.send(ORG, third, chat.id, messageInput('Yes'));
  });

  it('records a leave and an added person on their own events', async () => {
    const { svc, calls } = harness();
    const chat = await svc.startGroup(ORG, member, {
      communityId: COMMUNITY,
      orgUserIds: [other.id, third.id],
    });
    const left = await svc.leave(ORG, third, chat.id);
    expect(left.id).toBe(chat.id);
    expect(dataOf(calls.at(-1)![0]!).participantIds).toEqual([member.id, other.id].sort());
    await expect(svc.send(ORG, third, chat.id, messageInput('Gone'))).rejects.toThrow(
      'You are not in this chat',
    );
    await svc.addParticipant(ORG, member, chat.id, fourth.id);
    expect(calls.at(-1)?.map((event) => event.type)).toEqual(['discussion.chat.participant.added']);
    expect(dataOf(calls.at(-1)![0]!).addedBy).toBe(member.id);
    await svc.leave(ORG, fourth, chat.id);
    await svc.addParticipant(ORG, member, chat.id, fourth.id);
    expect(calls.at(-1)?.map((event) => event.type)).toEqual(['discussion.chat.participant.added']);
    await expect(svc.addParticipant(ORG, member, chat.id, other.id)).rejects.toThrow(
      'That person is already in this chat',
    );
  });

  it('finds a chat or message to moderate only in the community it names', async () => {
    const { svc, calls, flags } = harness({ settings: { firstMessageIsRequest: false } });
    const chat = await svc.startDirect(ORG, member, {
      communityId: COMMUNITY,
      orgUserId: other.id,
      body: 'Hello',
      assetIds: [],
    });
    const messageId = String(dataOf(calls[0]![1]!).id);
    await svc.flagMessage(ORG, other, messageId, 'spam');
    await expect(
      svc.resolveMessageFlags(ORG, staff, messageId, 'dismissed', 'cmy_other'),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(flags[0]?.resolution).toBeNull();
    await svc.resolveMessageFlags(ORG, staff, messageId, 'dismissed', COMMUNITY);
    expect(flags[0]?.resolution).toBe('dismissed');
    await expect(svc.lock(ORG, staff, chat.id, 'cmy_other')).rejects.toBeInstanceOf(NotFoundError);
    expect((await svc.lock(ORG, staff, chat.id, COMMUNITY)).lockedAt).toBeInstanceOf(Date);
    await expect(svc.unlock(ORG, staff, chat.id, 'cmy_other')).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect((await svc.unlock(ORG, staff, chat.id, COMMUNITY)).lockedAt).toBeNull();
  });

  it('lets staff lock a chat and work the message queue', async () => {
    const { svc, calls, flags } = harness({ settings: { firstMessageIsRequest: false } });
    const chat = await svc.startDirect(ORG, member, {
      communityId: COMMUNITY,
      orgUserId: other.id,
      body: 'Hello',
      assetIds: [],
    });
    await expect(svc.lock(ORG, member, chat.id)).rejects.toThrow('You cannot lock this chat');
    await expect(svc.lock(ORG, moderator, chat.id)).rejects.toThrow('You cannot lock this chat');
    await svc.lock(ORG, staff, chat.id);
    await expect(svc.unlock(ORG, moderator, chat.id)).rejects.toThrow('You cannot lock this chat');
    await svc.unlock(ORG, staff, chat.id);
    await svc.lock(ORG, staff, chat.id);
    await expect(svc.send(ORG, member, chat.id, messageInput('Later'))).rejects.toThrow(
      'This chat is locked',
    );
    const page = { page: 1, pageSize: 20 };
    await expect(svc.messages(ORG, member, chat.id, page)).resolves.toMatchObject({
      total: 1,
    });
    await expect(svc.messageQueue(ORG, member, COMMUNITY)).rejects.toThrow(
      'You cannot work this queue',
    );
    await expect(svc.messageQueue(ORG, moderator, COMMUNITY)).rejects.toThrow(
      'You cannot work this queue',
    );
    await expect(svc.messageQueue(ORG, staff, COMMUNITY)).resolves.toBeDefined();
    const messageId = String(dataOf(calls[0]![1]!).id);
    await svc.flagMessage(ORG, other, messageId, 'spam');
    expect(calls.at(-1)?.map((event) => event.type)).toEqual(['discussion.message.reported']);
    await svc.resolveMessageFlags(ORG, staff, messageId, 'dismissed');
    expect(flags[0]?.resolution).toBe('dismissed');
    expect(calls.at(-1)?.map((event) => event.type)).toEqual(['discussion.message.reported']);
    await expect(svc.resolveMessageFlags(ORG, member, messageId, 'dismissed')).rejects.toThrow(
      'You cannot work this queue',
    );
    await expect(svc.resolveMessageFlags(ORG, moderator, messageId, 'dismissed')).rejects.toThrow(
      'You cannot work this queue',
    );
  });

  it('serves each message with its attachments in order, by stable URL, to a participant', async () => {
    const { svc } = harness();
    const chat = await svc.startGroup(ORG, member, {
      communityId: COMMUNITY,
      orgUserIds: [other.id, moderator.id],
    });
    const sent = await svc.send(ORG, member, chat.id, {
      body: 'Look',
      replyToId: null,
      assetIds: ['asset_2', 'asset_gone', 'asset_1'],
    });
    expect(sent.attachments).toEqual([
      { assetId: 'asset_2', url: fileUrls.messageAttachment(chat.id, sent.id, 'asset_2') },
      { assetId: 'asset_gone', url: fileUrls.messageAttachment(chat.id, sent.id, 'asset_gone') },
      { assetId: 'asset_1', url: fileUrls.messageAttachment(chat.id, sent.id, 'asset_1') },
    ]);
    const plain = await svc.send(ORG, other, chat.id, messageInput('Nice'));
    expect(plain.attachments).toEqual([]);
    const page = await svc.messages(ORG, other, chat.id, { page: 1, pageSize: 20 });
    const byId = new Map(page.rows.map((row) => [row.id, row.attachments]));
    expect(byId.get(sent.id)).toEqual(sent.attachments);
    expect(byId.get(plain.id)).toEqual([]);
    await expect(svc.messages(ORG, staff, chat.id, { page: 1, pageSize: 20 })).rejects.toThrow(
      'You are not in this chat',
    );
    await svc.leave(ORG, other, chat.id);
    await expect(svc.messages(ORG, other, chat.id, { page: 1, pageSize: 20 })).rejects.toThrow(
      'You are not in this chat',
    );
  });

  it('returns the sender and attachments from send, edit and delete', async () => {
    const { svc } = harness();
    const chat = await svc.startGroup(ORG, member, {
      communityId: COMMUNITY,
      orgUserIds: [other.id, staff.id],
    });
    const sent = await svc.send(ORG, other, chat.id, {
      body: 'Look',
      replyToId: null,
      assetIds: ['asset_1'],
    });
    const sender = {
      id: other.id,
      imageAssetId: 'ast_other_photo',
      imageUrl: fileUrls.personImage('ou_other'),
    };
    expect(sent).toMatchObject({
      sender,
      attachments: [{ assetId: 'asset_1', url: expect.stringMatching(/\/attachments\/asset_1$/) }],
    });
    const same = await svc.editMessage(ORG, other, sent.id, 'Look');
    expect(same).toMatchObject({ sender, attachments: [{ assetId: 'asset_1' }] });
    const edited = await svc.editMessage(ORG, other, sent.id, 'Look here');
    expect(edited).toMatchObject({
      body: 'Look here',
      sender,
      attachments: [{ assetId: 'asset_1' }],
    });
    const removedByAuthor = await svc.deleteMessage(ORG, other, sent.id);
    expect(removedByAuthor).toMatchObject({ body: '', sender, attachments: [] });
    const kept = await svc.send(ORG, other, chat.id, {
      body: 'Again',
      replyToId: null,
      assetIds: ['asset_2'],
    });
    const removedByStaff = await svc.deleteMessage(ORG, staff, kept.id);
    expect(removedByStaff).toMatchObject({
      body: 'Again',
      attachments: [{ assetId: 'asset_2', url: expect.stringMatching(/\/attachments\/asset_2$/) }],
    });
  });

  it('does not sign a sender photo from another org', async () => {
    const { svc } = harness();
    const chat = await svc.startGroup(ORG, member, {
      communityId: COMMUNITY,
      orgUserIds: [other.id, third.id],
    });
    const sent = await svc.send(ORG, member, chat.id, messageInput('Hi'));
    expect(sent.sender).toMatchObject({ id: member.id, imageAssetId: null, imageUrl: null });
  });

  it('deletes a message for the author or staff and hides the body from members', async () => {
    const { svc, flags } = harness();
    const chat = await svc.startGroup(ORG, member, {
      communityId: COMMUNITY,
      orgUserIds: [other.id, staff.id],
    });
    const sent = await svc.send(ORG, member, chat.id, messageInput('Secret'));
    await expect(svc.deleteMessage(ORG, other, sent.id)).rejects.toThrow(
      'You cannot delete this message',
    );
    await expect(svc.editMessage(ORG, other, sent.id, 'No')).rejects.toThrow(
      'You can change only your own message',
    );
    const edited = await svc.editMessage(ORG, member, sent.id, 'Edited');
    expect(edited.body).toBe('Edited');
    await svc.flagMessage(ORG, other, sent.id, 'spam');
    const removed = await svc.deleteMessage(ORG, staff, sent.id);
    expect(removed.deletedAt).toBeInstanceOf(Date);
    expect(flags[0]).toMatchObject({ resolution: 'deleted', resolvedBy: staff.id });
    const seen = await svc.messages(ORG, member, chat.id, { page: 1, pageSize: 20 });
    expect(seen.rows[0]?.body).toBe('');
    expect(seen.rows[0]?.sender).toMatchObject({
      id: member.id,
      displayName: 'Sarah',
      imageAssetId: null,
      imageUrl: null,
    });
    const staffSeen = await svc.messages(ORG, staff, chat.id, { page: 1, pageSize: 20 });
    expect(staffSeen.rows[0]?.body).toBe('Edited');
    await expect(svc.messages(ORG, moderator, chat.id, { page: 1, pageSize: 20 })).rejects.toThrow(
      'You are not in this chat',
    );
  });

  it('rejoins a direct chat the member left and delivers the new body', async () => {
    const { svc, messages, calls } = harness({ settings: { firstMessageIsRequest: false } });
    const chat = await svc.startDirect(ORG, member, {
      communityId: COMMUNITY,
      orgUserId: other.id,
      body: null,
      assetIds: [],
    });
    await svc.leave(ORG, member, chat.id);
    await expect(svc.send(ORG, member, chat.id, messageInput('No'))).rejects.toThrow(
      'You are not in this chat',
    );
    const again = await svc.startDirect(ORG, member, {
      communityId: COMMUNITY,
      orgUserId: other.id,
      body: 'Back',
      assetIds: [],
    });
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
    const chat = await svc.startDirect(ORG, member, {
      communityId: COMMUNITY,
      orgUserId: other.id,
      body: 'Hello',
      assetIds: [],
    });
    const page = await svc.messages(ORG, member, chat.id, { page: 1, pageSize: 20 });
    dropMember(member.id);
    await expect(svc.messages(ORG, member, chat.id, { page: 1, pageSize: 20 })).rejects.toThrow(
      'You are not a member of this community',
    );
    await expect(svc.send(ORG, member, chat.id, messageInput('No'))).rejects.toThrow(
      'You are not a member of this community',
    );
    await expect(svc.editMessage(ORG, member, page.rows[0]!.id, 'Changed')).rejects.toThrow(
      'You are not a member of this community',
    );
  });

  it('refuses an edit when the chat is locked or the author has left', async () => {
    const { svc, flags } = harness({ settings: { firstMessageIsRequest: false } });
    const chat = await svc.startDirect(ORG, member, {
      communityId: COMMUNITY,
      orgUserId: other.id,
      body: 'Hello',
      assetIds: [],
    });
    const page = await svc.messages(ORG, member, chat.id, { page: 1, pageSize: 20 });
    const messageId = page.rows[0]!.id;
    await svc.flagMessage(ORG, other, messageId, 'spam');
    await svc.lock(ORG, staff, chat.id);
    expect(flags[0]).toMatchObject({ resolution: 'locked', resolvedBy: staff.id });
    await expect(svc.editMessage(ORG, member, messageId, 'Changed')).rejects.toThrow(
      'You cannot send in this chat',
    );
    await expect(svc.deleteMessage(ORG, member, messageId)).rejects.toThrow(
      'You cannot send in this chat',
    );
    await svc.unlock(ORG, staff, chat.id);
    await svc.leave(ORG, member, chat.id);
    await expect(svc.editMessage(ORG, member, messageId, 'Changed')).rejects.toThrow(
      'You are not in this chat',
    );
  });

  it('gives a moderator in a chat only what any participant has', async () => {
    const { svc } = harness();
    const chat = await svc.startGroup(ORG, member, {
      communityId: COMMUNITY,
      orgUserIds: [other.id, moderator.id],
    });
    const sent = await svc.send(ORG, member, chat.id, {
      body: 'Look',
      replyToId: null,
      assetIds: ['asset_1'],
    });
    await svc.flagMessage(ORG, other, sent.id, 'spam');
    await expect(svc.deleteMessage(ORG, moderator, sent.id)).rejects.toThrow(
      'You cannot delete this message',
    );
    await expect(svc.lock(ORG, moderator, chat.id)).rejects.toThrow('You cannot lock this chat');
    await expect(svc.resolveMessageFlags(ORG, moderator, sent.id, 'dismissed')).rejects.toThrow(
      'You cannot work this queue',
    );
    expect(await svc.attachmentFile(ORG, moderator, chat.id, sent.id, 'asset_1')).toBe(
      'https://signed',
    );
    await svc.deleteMessage(ORG, member, sent.id);
    expect(await svc.attachmentFile(ORG, moderator, chat.id, sent.id, 'asset_1')).toBeNull();
    const own = await svc.send(ORG, moderator, chat.id, messageInput('Mine'));
    expect((await svc.deleteMessage(ORG, moderator, own.id)).deletedAt).toBeInstanceOf(Date);
  });

  it('lets staff delete a message in a locked chat they are not in', async () => {
    const { svc, flags } = harness({ settings: { firstMessageIsRequest: false } });
    const chat = await svc.startDirect(ORG, member, {
      communityId: COMMUNITY,
      orgUserId: other.id,
      body: 'Hello',
      assetIds: [],
    });
    const page = await svc.messages(ORG, member, chat.id, { page: 1, pageSize: 20 });
    const messageId = page.rows[0]!.id;
    await svc.flagMessage(ORG, other, messageId, 'spam');
    await svc.lock(ORG, staff, chat.id);
    const removed = await svc.deleteMessage(ORG, staff, messageId);
    expect(removed.deletedAt).toBeInstanceOf(Date);
    await expect(svc.deleteMessage(ORG, other, messageId)).rejects.toThrow(
      'You cannot delete this message',
    );
    expect(flags[0]).toMatchObject({ resolution: 'locked' });
  });

  it('refuses attachments on a direct chat started without a message', async () => {
    const { svc, chats } = harness();
    await expect(
      svc.startDirect(ORG, member, {
        communityId: COMMUNITY,
        orgUserId: other.id,
        body: null,
        assetIds: ['ast_1'],
      }),
    ).rejects.toThrow('An attachment needs a message');
    expect(chats).toHaveLength(0);
  });

  it('checks the other person in a direct chat they left', async () => {
    const left = harness({ settings: { firstMessageIsRequest: false } });
    const input = { communityId: COMMUNITY, orgUserId: other.id, body: 'Hello', assetIds: [] };
    const chat = await left.svc.startDirect(ORG, member, input);
    await left.svc.leave(ORG, other, chat.id);
    await left.svc.send(ORG, member, chat.id, messageInput('Still there?'));
    left.block(COMMUNITY, other.id, member.id);
    await expect(left.svc.send(ORG, member, chat.id, messageInput('No'))).rejects.toThrow(
      'You cannot send in this chat',
    );
    const lapsed = harness({ settings: { firstMessageIsRequest: false } });
    const direct = await lapsed.svc.startDirect(ORG, member, input);
    await lapsed.svc.leave(ORG, other, direct.id);
    lapsed.dropMember(other.id);
    await expect(lapsed.svc.send(ORG, member, direct.id, messageInput('No'))).rejects.toThrow(
      'You cannot send in this chat',
    );
  });

  it('serves no attachments of a deleted message to a member and all of them to staff', async () => {
    const { svc, dropMember } = harness();
    const chat = await svc.startGroup(ORG, member, {
      communityId: COMMUNITY,
      orgUserIds: [other.id, third.id],
    });
    const sent = await svc.send(ORG, member, chat.id, {
      body: 'Look',
      replyToId: null,
      assetIds: ['asset_1'],
    });
    const kept = await svc.send(ORG, member, chat.id, {
      body: 'Keep',
      replyToId: null,
      assetIds: ['asset_2'],
    });
    await svc.flagMessage(ORG, other, sent.id, 'spam');
    await svc.deleteMessage(ORG, member, sent.id);
    const page = await svc.messages(ORG, other, chat.id, { page: 1, pageSize: 20 });
    const byId = new Map(page.rows.map((row) => [row.id, row]));
    expect(byId.get(sent.id)).toMatchObject({ body: '', attachments: [] });
    expect(byId.get(kept.id)).toMatchObject({
      body: 'Keep',
      attachments: [{ assetId: 'asset_2', url: expect.stringMatching(/\/attachments\/asset_2$/) }],
    });
    await svc.flagMessage(ORG, third, kept.id, 'rude');
    const queue = await svc.messageQueue(ORG, staff, COMMUNITY);
    expect(queue.entries.map((entry) => entry.message.attachments)).toEqual([
      [{ assetId: 'asset_2', url: expect.stringMatching(/\/attachments\/asset_2$/) }],
    ]);
    dropMember(other.id);
    await expect(svc.messages(ORG, other, chat.id, { page: 1, pageSize: 20 })).rejects.toThrow(
      'You are not a member of this community',
    );
  });

  it('skips lapsed members in a group and refuses a direct chat with one', async () => {
    const { svc, dropMember } = harness({ settings: { firstMessageIsRequest: false } });
    const group = await svc.startGroup(ORG, member, {
      communityId: COMMUNITY,
      orgUserIds: [other.id, third.id],
    });
    const direct = await svc.startDirect(ORG, member, {
      communityId: COMMUNITY,
      orgUserId: third.id,
      body: null,
      assetIds: [],
    });
    dropMember(third.id);
    await svc.send(ORG, member, group.id, messageInput('Still here'));
    await expect(svc.send(ORG, member, direct.id, messageInput('No'))).rejects.toThrow(
      'You cannot send in this chat',
    );
  });

  it('checks only the added person against the people in the group, in one query', async () => {
    const { svc, block, queries } = harness();
    const chat = await svc.startGroup(ORG, member, {
      communityId: COMMUNITY,
      orgUserIds: [other.id, third.id],
    });
    expect(queries.anyBlockedAmong).toBe(1);
    expect(queries.isBlocked).toBe(0);
    block(COMMUNITY, member.id, other.id);
    await svc.addParticipant(ORG, third, chat.id, fourth.id);
    expect(queries.blockedWith).toBe(1);
    expect(queries.isBlocked).toBe(0);
    await svc.leave(ORG, fourth, chat.id);
    block(COMMUNITY, fourth.id, third.id);
    await expect(svc.addParticipant(ORG, member, chat.id, fourth.id)).rejects.toThrow(
      'You cannot message this person',
    );
    await expect(
      svc.startGroup(ORG, member, { communityId: COMMUNITY, orgUserIds: [other.id, fourth.id] }),
    ).rejects.toThrow('You cannot message this person');
  });

  it('leaves a direct chat untouched when the send that would rejoin it is refused', async () => {
    const { svc, calls, users } = harness({ settings: { firstMessageIsRequest: false } });
    const chat = await svc.startDirect(ORG, member, {
      communityId: COMMUNITY,
      orgUserId: other.id,
      body: null,
      assetIds: [],
    });
    await svc.leave(ORG, member, chat.id);
    await svc.block(ORG, other, COMMUNITY, member.id);
    const before = calls.length;
    await expect(
      svc.startDirect(ORG, member, {
        communityId: COMMUNITY,
        orgUserId: other.id,
        body: 'Back',
        assetIds: [],
      }),
    ).rejects.toThrow('You cannot send in this chat');
    expect(calls).toHaveLength(before);
    expect(users.find((user) => user.orgUserId === member.id)?.leftAt).toBeInstanceOf(Date);
    await svc.unblock(ORG, other, COMMUNITY, member.id);
    await svc.startDirect(ORG, member, {
      communityId: COMMUNITY,
      orgUserId: other.id,
      body: null,
      assetIds: [],
    });
    expect(calls.at(-1)?.map((event) => event.type)).toEqual(['discussion.chat.updated']);
    expect(users.find((user) => user.orgUserId === member.id)?.leftAt).toBeNull();
  });

  it('opens a direct chat at once when either person is staff', async () => {
    const { svc } = harness();
    const fromStaff = await svc.startDirect(ORG, staff, {
      communityId: COMMUNITY,
      orgUserId: member.id,
      body: null,
      assetIds: [],
    });
    expect(fromStaff.status).toBe('open');
    const toStaff = await svc.startDirect(ORG, other, {
      communityId: COMMUNITY,
      orgUserId: staff.id,
      body: null,
      assetIds: [],
    });
    expect(toStaff.status).toBe('open');
    const between = await svc.startDirect(ORG, moderator, {
      communityId: COMMUNITY,
      orgUserId: member.id,
      body: 'Hello',
      assetIds: [],
    });
    expect(between.status).toBe('pending');
  });

  it('returns the existing flag when a message is flagged again', async () => {
    const { svc, calls, flags } = harness({ settings: { firstMessageIsRequest: false } });
    await svc.startDirect(ORG, member, {
      communityId: COMMUNITY,
      orgUserId: other.id,
      body: 'Hello',
      assetIds: [],
    });
    const messageId = String(dataOf(calls[0]![1]!).id);
    const first = await svc.flagMessage(ORG, other, messageId, 'spam');
    const before = calls.length;
    const again = await svc.flagMessage(ORG, other, messageId, 'again');
    expect(again.id).toBe(first.id);
    expect(again.reason).toBe('spam');
    expect(calls).toHaveLength(before);
    expect(flags).toHaveLength(1);
  });

  it('mutes with a flag and an optional end time, and unmuting clears both', async () => {
    const { svc, users } = harness({ settings: { firstMessageIsRequest: false } });
    const chat = await svc.startDirect(ORG, member, {
      communityId: COMMUNITY,
      orgUserId: other.id,
      body: null,
      assetIds: [],
    });
    const mine = () => {
      const user = users.find((row) => row.orgUserId === member.id);
      return [user?.muted, user?.mutedUntil];
    };
    expect(mine()).toEqual([false, null]);
    await svc.mute(ORG, member, chat.id);
    expect(mine()).toEqual([true, null]);
    const listed = (await svc.listChats(ORG, member, COMMUNITY))[0];
    expect([listed?.muted, listed?.mutedUntil]).toEqual([true, null]);
    const until = new Date('2030-01-01T00:00:00Z');
    await svc.mute(ORG, member, chat.id, until);
    expect(mine()).toEqual([true, until]);
    await svc.unmute(ORG, member, chat.id);
    expect(mine()).toEqual([false, null]);
  });

  it('serves each queued message with its flags, its chat and the people in it', async () => {
    const { svc } = harness();
    const chat = await svc.startGroup(ORG, member, {
      communityId: COMMUNITY,
      orgUserIds: [other.id, third.id],
    });
    await svc.send(ORG, member, chat.id, messageInput('Before'));
    const sent = await svc.send(ORG, member, chat.id, {
      body: 'Rude',
      replyToId: null,
      assetIds: ['asset_1'],
    });
    await svc.flagMessage(ORG, other, sent.id, 'spam');
    await svc.flagMessage(ORG, third, sent.id, 'rude');
    const queue = await svc.messageQueue(ORG, staff, COMMUNITY);
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
    const chat = await svc.startGroup(ORG, member, {
      communityId: COMMUNITY,
      orgUserIds: [other.id, third.id],
    });
    const first = await svc.send(ORG, member, chat.id, messageInput('First'));
    const second = await svc.send(ORG, other, chat.id, messageInput('Second'));
    const third_ = await svc.send(ORG, third, chat.id, messageInput('Third'));
    for (const [index, id] of [first.id, second.id, third_.id].entries()) {
      messages.find((row) => row.id === id)!.createdAt = new Date(index * 60_000);
    }
    await svc.setReaction(ORG, member, second.id, '👍');
    await svc.setReaction(ORG, other, second.id, '👍');
    await svc.setReaction(ORG, third, second.id, '🎉');
    const page = await svc.messages(ORG, member, chat.id, { page: 1, pageSize: 2 });
    expect(page.rows.map((row) => row.id)).toEqual([third_.id, second.id]);
    expect(page).toMatchObject({ total: 3, page: 1, pageSize: 2 });
    expect(page.rows[0]).toMatchObject({ reactions: {}, viewerReaction: null });
    expect(page.rows[1]).toMatchObject({
      reactions: { '👍': 2, '🎉': 1 },
      viewerReaction: '👍',
    });
    const rest = await svc.messages(ORG, third, chat.id, { page: 2, pageSize: 2 });
    expect(rest.rows.map((row) => row.id)).toEqual([first.id]);
    expect(
      (await svc.messages(ORG, third, chat.id, { page: 1, pageSize: 20 })).rows[1],
    ).toMatchObject({ viewerReaction: '🎉' });
    await svc.setReaction(ORG, member, second.id, null);
    const edited = await svc.editMessage(ORG, other, second.id, 'Second again');
    expect(edited).toMatchObject({ reactions: { '👍': 1, '🎉': 1 }, viewerReaction: '👍' });
    expect(
      (await svc.messages(ORG, member, chat.id, { page: 1, pageSize: 20 })).rows[1],
    ).toMatchObject({ viewerReaction: null });
  });

  it('lists each chat with its last message, blank for a deleted one unless staff reads it', async () => {
    const { svc, messages } = harness({ settings: { firstMessageIsRequest: false } });
    const empty = await svc.startDirect(ORG, member, {
      communityId: COMMUNITY,
      orgUserId: other.id,
      body: null,
      assetIds: [],
    });
    const group = await svc.startGroup(ORG, member, {
      communityId: COMMUNITY,
      orgUserIds: [other.id, staff.id],
    });
    const earlier = await svc.send(ORG, other, group.id, messageInput('Earlier'));
    const latest = await svc.send(ORG, member, group.id, messageInput('Latest'));
    messages.find((row) => row.id === earlier.id)!.createdAt = new Date(0);
    messages.find((row) => row.id === latest.id)!.createdAt = new Date(60_000);
    const byId = (items: ChatListItem[]) => new Map(items.map((item) => [item.chat.id, item]));
    const listed = byId(await svc.listChats(ORG, member, COMMUNITY));
    expect(listed.get(empty.id)?.lastMessage).toBeNull();
    expect(listed.get(group.id)?.lastMessage).toEqual({
      id: latest.id,
      orgUserId: member.id,
      body: 'Latest',
      createdAt: new Date(60_000),
      deletedAt: null,
    });
    await svc.deleteMessage(ORG, member, latest.id);
    const afterDelete = byId(await svc.listChats(ORG, other, COMMUNITY)).get(group.id);
    expect(afterDelete?.lastMessage).toMatchObject({ id: latest.id, body: '' });
    expect(afterDelete?.lastMessage?.deletedAt).toBeInstanceOf(Date);
    const staffSees = byId(await svc.listChats(ORG, staff, COMMUNITY)).get(group.id);
    expect(staffSees?.lastMessage).toMatchObject({ id: latest.id, body: 'Latest' });
  });

  it('serves an attachment to participants, to staff after deletion, and to staff while flagged', async () => {
    const { svc } = harness();
    const admin: Actor = { id: 'ou_admin', role: 'admin' };
    const chat = await svc.startGroup(ORG, member, {
      communityId: COMMUNITY,
      orgUserIds: [other.id, staff.id],
    });
    const sent = await svc.send(ORG, member, chat.id, {
      body: 'Look',
      replyToId: null,
      assetIds: ['asset_1'],
    });
    const file = (actor: Actor, assetId = 'asset_1') =>
      svc.attachmentFile(ORG, actor, chat.id, sent.id, assetId);

    expect(await file(other)).toBe('https://signed');
    expect(await file(other, 'asset_other')).toBeNull();
    expect(await file(third)).toBeNull();
    expect(await file(moderator)).toBeNull();
    expect(await svc.attachmentFile(ORG, other, 'chat_missing', sent.id, 'asset_1')).toBeNull();

    expect(await file(admin)).toBeNull();
    await svc.flagMessage(ORG, other, sent.id, 'spam');
    expect(await file(moderator)).toBeNull();
    expect(await file(admin)).toBe('https://signed');

    await svc.deleteMessage(ORG, member, sent.id);
    expect(await file(other)).toBeNull();
    expect(await file(staff)).toBe('https://signed');
  });
});
