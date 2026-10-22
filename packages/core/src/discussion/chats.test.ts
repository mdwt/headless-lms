import { describe, expect, it } from 'vitest';
import { ConflictError, ForbiddenError, NotFoundError } from '../shared/errors.js';
import type { Actor } from '../shared/actor.js';
import type { NewDomainEvent } from '../shared/ports.js';
import type { DmSettings } from '../content/index.js';
import { isStaffRole } from '../organizations/index.js';
import type { CommunityAccessReader } from '../entitlements/index.js';
import type { ImageOwnerReader } from '../assets/index.js';
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

function harness(options?: {
  settings?: Partial<DmSettings> | null;
  members?: string[];
  images?: ImageOwnerReader;
}) {
  const chats: Chat[] = [];
  const users: ChatUser[] = [];
  const messages: Message[] = [];
  const attachments: { messageId: string; assetIds: string[] }[] = [];
  const blocks: { communityId: string; blocker: string; blocked: string }[] = [];
  const flags: MessageFlag[] = [];
  const calls: NewDomainEvent[][] = [];
  const members = new Set(
    options?.members ?? [member.id, other.id, third.id, fourth.id, moderator.id],
  );
  const settings = options?.settings === null ? null : { ...dmSettings, ...options?.settings };

  const pair = (a: string, b: string) => [a, b].sort().join(':');

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
          return {
            chat: { ...chat },
            participantIds: users
              .filter((user) => user.chatId === chat.id && user.leftAt === null)
              .map((user) => user.orgUserId)
              .sort(),
            lastReadMessageId: mine?.lastReadMessageId ?? null,
            mutedUntil: mine?.mutedUntil ?? null,
            unread: 0,
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
    async setMuted(orgId, chatId, orgUserId, mutedUntil) {
      const user = users.find(
        (row) => row.orgId === orgId && row.chatId === chatId && row.orgUserId === orgUserId,
      );
      if (user) {
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
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || (a.id < b.id ? -1 : 1));
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
    async setReaction() {},
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
      return blocks.some(
        (row) =>
          row.communityId === communityId &&
          ((row.blocker === a && row.blocked === b) || (row.blocker === b && row.blocked === a)),
      );
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

  const access: CommunityAccessReader = {
    async isCommunityMember(_orgId, actor) {
      if (isStaffRole(actor.role)) {
        return true;
      }
      return members.has(actor.id);
    },
    async canOpenSpace() {
      return false;
    },
    async openSpaceIds() {
      return [];
    },
    async grantOpensCommunity() {
      return false;
    },
  };

  const authors: AuthorRoleReader = {
    async roleOf(_orgId, orgUserId) {
      return roles[orgUserId] ?? null;
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
    images: options?.images ?? { ownsImage: async () => true },
    uow,
  });

  return {
    svc,
    chats,
    messages,
    attachments,
    flags,
    calls,
    dropMember(id: string) {
      members.delete(id);
    },
  };
}

describe('chats', () => {
  it('starts a direct chat as a request and records the chat once', async () => {
    const { svc, calls } = harness();
    const chat = await svc.startDirect(ORG, member, {
      communityId: COMMUNITY,
      orgUserId: other.id,
      body: null,
      assetIds: [],
    });
    expect(chat.status).toBe('pending');
    expect(chat.kind).toBe('direct');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.map((event) => event.type)).toEqual(['discussion.chat.created']);
    expect(calls[0]?.[0]?.metadata).toEqual({ actorOrgUserId: member.id });
    expect(dataOf(calls[0]![0]!).participantIds).toEqual([member.id, other.id].sort());
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
    ).rejects.toBeInstanceOf(ConflictError);
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

  it('keeps the creator from sending and lets the recipient accept by replying', async () => {
    const { svc, calls, chats } = harness();
    const chat = await svc.startDirect(ORG, member, {
      communityId: COMMUNITY,
      orgUserId: other.id,
      body: null,
      assetIds: [],
    });
    await expect(svc.accept(ORG, member, chat.id)).rejects.toThrow(
      'You cannot accept this request',
    );
    await expect(svc.send(ORG, member, chat.id, messageInput('No'))).rejects.toThrow(
      'You cannot send in this chat',
    );
    const sent = await svc.send(ORG, other, chat.id, messageInput('Hello'));
    expect(sent.communityId).toBe(COMMUNITY);
    expect(chats.find((row) => row.id === chat.id)?.status).toBe('open');
    expect(calls.at(-1)?.map((event) => event.type)).toEqual([
      'discussion.chat.updated',
      'discussion.message.sent',
    ]);
    expect(calls.at(-1)?.[0]?.metadata).toEqual({ actorOrgUserId: other.id });
    await expect(svc.accept(ORG, other, chat.id)).rejects.toThrow('This chat is not a request');
    await svc.send(ORG, member, chat.id, messageInput('Hi'));
  });

  it('closes only this community direct chat when one person blocks the other', async () => {
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
    await svc.block(ORG, member, COMMUNITY, other.id);
    expect(calls.at(-1)?.map((event) => event.type)).toEqual(['discussion.chat.updated']);
    expect(dataOf(calls.at(-1)![0]!).status).toBe('closed');
    await expect(svc.send(ORG, member, chat.id, messageInput('Hey'))).rejects.toThrow(
      'You cannot send in this chat',
    );
    await svc.send(ORG, member, elsewhere.id, messageInput('Still here'));
    await svc.unblock(ORG, member, COMMUNITY, other.id);
    expect(dataOf(calls.at(-1)![0]!).status).toBe('open');
    await svc.send(ORG, member, chat.id, messageInput('Back'));
  });

  it('keeps a locked direct chat closed when the block is lifted', async () => {
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
    await expect(svc.send(ORG, member, chat.id, messageInput('No'))).rejects.toThrow(
      'You cannot send in this chat',
    );
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

  it('lets staff lock a chat and work the message queue', async () => {
    const { svc, calls, flags } = harness({ settings: { firstMessageIsRequest: false } });
    const chat = await svc.startDirect(ORG, member, {
      communityId: COMMUNITY,
      orgUserId: other.id,
      body: 'Hello',
      assetIds: [],
    });
    await expect(svc.lock(ORG, moderator, chat.id)).rejects.toThrow('You cannot lock this chat');
    await svc.lock(ORG, staff, chat.id);
    await expect(svc.send(ORG, member, chat.id, messageInput('Later'))).rejects.toThrow(
      'This chat is locked',
    );
    const page = { page: 1, pageSize: 20 };
    await expect(svc.messages(ORG, member, chat.id, page)).resolves.toMatchObject({
      total: 1,
    });
    await expect(svc.messageQueue(ORG, moderator, COMMUNITY)).rejects.toThrow(
      'You cannot work this queue',
    );
    const messageId = String(dataOf(calls[0]![1]!).id);
    await svc.flagMessage(ORG, other, messageId, 'spam');
    await expect(svc.flagMessage(ORG, other, messageId, 'again')).rejects.toBeInstanceOf(
      ConflictError,
    );
    expect(calls.at(-1)?.map((event) => event.type)).toEqual(['discussion.message.reported']);
    const queue = await svc.messageQueue(ORG, staff, COMMUNITY);
    expect(queue.flags).toHaveLength(1);
    expect(queue.messages[0]?.body).toBe('Hello');
    await svc.resolveMessageFlags(ORG, staff, messageId, 'dismissed');
    expect(flags[0]?.resolution).toBe('dismissed');
    expect(calls.at(-1)?.map((event) => event.type)).toEqual(['discussion.message.reported']);
    await expect(svc.resolveMessageFlags(ORG, moderator, messageId, 'deleted')).rejects.toThrow(
      'You cannot work this queue',
    );
  });

  it('deletes a message for the author or staff and hides the body from members', async () => {
    const { svc, flags } = harness();
    const chat = await svc.startGroup(ORG, member, {
      communityId: COMMUNITY,
      orgUserIds: [other.id, staff.id],
    });
    const sent = await svc.send(ORG, member, chat.id, messageInput('Secret'));
    await expect(svc.deleteMessage(ORG, moderator, sent.id)).rejects.toThrow(
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
    const staffSeen = await svc.messages(ORG, staff, chat.id, { page: 1, pageSize: 20 });
    expect(staffSeen.rows[0]?.body).toBe('Edited');
    await expect(svc.messages(ORG, moderator, chat.id, { page: 1, pageSize: 20 })).rejects.toThrow(
      'You are not in this chat',
    );
  });

  it('rejoins a direct chat the member left and delivers the new body', async () => {
    const { svc, messages } = harness({ settings: { firstMessageIsRequest: false } });
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
});
