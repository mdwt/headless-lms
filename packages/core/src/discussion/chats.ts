import { genId } from '../shared/id.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../shared/errors.js';
import type { Logger } from '../shared/ports.js';
import { noopLogger } from '../shared/logger.js';
import { isStaffRole } from '../organizations/index.js';
import type { Role } from '../organizations/index.js';
import type { CommunityReader, DmSettings } from '../content/index.js';
import type { CommunityAccessReader } from '../entitlements/index.js';
import type { AssetUrlSigner, MemberImageReader } from '../assets/index.js';
import type {
  Chat,
  ChatUser,
  Message,
  MessageFlag,
  MessageFlagResolution,
  MessageView,
  Page,
  ReactionEmoji,
} from '../types/index.js';
import type { Actor } from '../shared/actor.js';
import type { NewDiscussionEvent } from './events.js';
import { discussionEvents } from './events.js';
import { authorImageIds, authorView } from './authors.js';
import type {
  AuthorProfileReader,
  AuthorRoleReader,
  ChatListItem,
  ChatRepository,
  ChatService,
  ChatUnitOfWork,
  MessageQueue,
  MessageQueueEntry,
  SendMessageInput,
  StartDirectInput,
  StartGroupInput,
} from './ports.js';

export type ChatServiceParams = {
  repo: ChatRepository;
  access: CommunityAccessReader;
  content: CommunityReader;
  authors: AuthorRoleReader;
  profiles: AuthorProfileReader;
  images: MemberImageReader;
  assetUrls: AssetUrlSigner;
  uow: ChatUnitOfWork;
  logger?: Logger;
};

export class ChatServiceImpl implements ChatService {
  private readonly repo: ChatRepository;
  private readonly access: CommunityAccessReader;
  private readonly content: CommunityReader;
  private readonly authors: AuthorRoleReader;
  private readonly profiles: AuthorProfileReader;
  private readonly images: MemberImageReader;
  private readonly assetUrls: AssetUrlSigner;
  private readonly uow: ChatUnitOfWork;
  private readonly logger: Logger;

  constructor(params: ChatServiceParams) {
    this.repo = params.repo;
    this.access = params.access;
    this.content = params.content;
    this.authors = params.authors;
    this.profiles = params.profiles;
    this.images = params.images;
    this.assetUrls = params.assetUrls;
    this.uow = params.uow;
    this.logger = params.logger ?? noopLogger;
  }

  async startDirect(orgId: string, actor: Actor, input: StartDirectInput): Promise<Chat> {
    if (actor.id === input.orgUserId) {
      throw new ConflictError('You cannot message yourself');
    }
    if (input.body === null && input.assetIds.length > 0) {
      throw new ConflictError('An attachment needs a message');
    }
    const settings = await this.requireSettings(orgId, input.communityId);
    await this.requireActor(orgId, actor, input.communityId);
    const role = await this.requirePerson(orgId, input.communityId, input.orgUserId);
    this.assertMayMessage(settings, actor, role);
    const first: SendMessageInput | null =
      input.body === null ? null : { body: input.body, replyToId: null, assetIds: input.assetIds };
    const saved = await this.uow.run(async ({ chats, outbox }) => {
      await chats.lockDirectPair(orgId, input.communityId, actor.id, input.orgUserId);
      const existing = await chats.findDirect(orgId, input.communityId, actor.id, input.orgUserId);
      if (existing) {
        const users = await chats.participants(orgId, existing.id);
        const rejoin = users.some((user) => user.orgUserId === actor.id && user.leftAt !== null);
        const present = users.map((user) =>
          user.orgUserId === actor.id ? { ...user, leftAt: null } : user,
        );
        if (first) {
          await this.assertMaySend(chats, orgId, actor, existing, present, settings, first);
        }
        if (rejoin) {
          await chats.join(
            orgId,
            this.memberRow(orgId, existing.communityId, existing.id, actor.id, new Date()),
          );
        }
        const written = first
          ? await this.writeMessage(chats, orgId, actor, existing, first)
          : null;
        const chat = written?.chat ?? existing;
        const events: NewDiscussionEvent[] = [];
        if (rejoin || written?.opened) {
          events.push(this.updatedEvent(orgId, actor, chat, present));
        }
        if (written) {
          events.push(this.sentEvent(orgId, actor, written.chat, written.message));
        }
        if (events.length > 0) {
          await outbox.append(events);
        }
        return { chat, created: false };
      }
      await this.requireOwnedImages(orgId, actor.id, input.assetIds);
      if (await chats.isBlocked(orgId, input.communityId, actor.id, input.orgUserId)) {
        throw new ForbiddenError('You cannot message this person');
      }
      const request =
        settings.firstMessageIsRequest && !isStaffRole(actor.role) && !isStaffRole(role);
      if (request && !first) {
        throw new ConflictError('A message request needs a message');
      }
      const now = new Date();
      const chat = await chats.insertChat(orgId, {
        orgId,
        id: genId('chat'),
        communityId: input.communityId,
        kind: 'direct',
        status: request ? 'pending' : 'open',
        createdBy: actor.id,
        lockedAt: null,
        lockedBy: null,
        createdAt: now,
        updatedAt: now,
      });
      const users = [actor.id, input.orgUserId].map((orgUserId) =>
        this.memberRow(orgId, chat.communityId, chat.id, orgUserId, now),
      );
      for (const user of users) {
        await chats.join(orgId, user);
      }
      const events: NewDiscussionEvent[] = [this.createdEvent(orgId, actor, chat, users)];
      if (first) {
        const written = await this.writeMessage(chats, orgId, actor, chat, first);
        events.push(this.sentEvent(orgId, actor, written.chat, written.message));
      }
      await outbox.append(events);
      return { chat, created: true };
    });
    if (saved.created) {
      this.logger.info('direct chat started', {
        orgId,
        communityId: input.communityId,
        chatId: saved.chat.id,
        status: saved.chat.status,
      });
    } else {
      this.logger.debug('direct chat already exists', {
        orgId,
        communityId: input.communityId,
        chatId: saved.chat.id,
      });
    }
    return saved.chat;
  }

  async startGroup(orgId: string, actor: Actor, input: StartGroupInput): Promise<Chat> {
    const settings = await this.requireSettings(orgId, input.communityId);
    this.assertGroup(settings);
    await this.requireActor(orgId, actor, input.communityId);
    const others = [...new Set(input.orgUserIds.filter((id) => id !== actor.id))].sort();
    if (others.length < 2) {
      throw new ConflictError('A group chat needs three people');
    }
    if (others.length + 1 > settings.groupSize) {
      throw new ConflictError('This group is full');
    }
    for (const orgUserId of others) {
      const role = await this.requirePerson(orgId, input.communityId, orgUserId);
      this.assertMayMessage(settings, actor, role);
    }
    const saved = await this.uow.run(async ({ chats, outbox }) => {
      if (await chats.anyBlockedAmong(orgId, input.communityId, [actor.id, ...others])) {
        throw new ForbiddenError('You cannot add that person');
      }
      const now = new Date();
      const chat = await chats.insertChat(orgId, {
        orgId,
        id: genId('chat'),
        communityId: input.communityId,
        kind: 'group',
        status: 'open',
        createdBy: actor.id,
        lockedAt: null,
        lockedBy: null,
        createdAt: now,
        updatedAt: now,
      });
      const ids = [actor.id, ...others];
      const users = ids.map((orgUserId) =>
        this.memberRow(orgId, chat.communityId, chat.id, orgUserId, now),
      );
      for (const user of users) {
        await chats.join(orgId, user);
      }
      const events: NewDiscussionEvent[] = [
        this.createdEvent(orgId, actor, chat, users),
        ...others.map((orgUserId) => this.addedEvent(orgId, actor, chat, orgUserId)),
      ];
      await outbox.append(events);
      return chat;
    });
    this.logger.info('group chat started', {
      orgId,
      communityId: input.communityId,
      chatId: saved.id,
    });
    return saved;
  }

  async addParticipant(
    orgId: string,
    actor: Actor,
    chatId: string,
    orgUserId: string,
  ): Promise<Chat> {
    const chat = await this.mustChat(this.repo, orgId, chatId);
    await this.requireActor(orgId, actor, chat.communityId);
    await this.requireActive(this.repo, orgId, chat.id, actor.id);
    if (chat.kind !== 'group') {
      throw new ConflictError('This chat is not a group');
    }
    const settings = await this.requireSettings(orgId, chat.communityId);
    this.assertGroup(settings);
    const role = await this.requirePerson(orgId, chat.communityId, orgUserId);
    this.assertMayMessage(settings, actor, role);
    const saved = await this.uow.run(async ({ chats, outbox }) => {
      const current = await this.mustChat(chats, orgId, chatId);
      const users = await chats.participants(orgId, chatId);
      this.assertActive(users, actor.id);
      const existing = users.find((user) => user.orgUserId === orgUserId);
      if (existing && existing.leftAt === null) {
        throw new ConflictError('That person is already in this chat');
      }
      const active = users.filter((user) => user.leftAt === null);
      if (active.length + 1 > settings.groupSize) {
        throw new ConflictError('This group is full');
      }
      const blocked = await chats.blockedWith(
        orgId,
        current.communityId,
        orgUserId,
        active.map((user) => user.orgUserId),
      );
      if (blocked.length > 0) {
        throw new ForbiddenError('You cannot add that person');
      }
      const now = new Date();
      await chats.join(
        orgId,
        this.memberRow(orgId, current.communityId, current.id, orgUserId, now),
      );
      await outbox.append([this.addedEvent(orgId, actor, current, orgUserId)]);
      return current;
    });
    this.logger.info('chat participant added', { orgId, chatId, orgUserId });
    return saved;
  }

  async leave(orgId: string, actor: Actor, chatId: string): Promise<Chat> {
    const chat = await this.mustChat(this.repo, orgId, chatId);
    await this.requireActor(orgId, actor, chat.communityId);
    await this.requireActive(this.repo, orgId, chat.id, actor.id);
    const saved = await this.uow.run(async ({ chats, outbox }) => {
      const current = await this.mustChat(chats, orgId, chatId);
      const users = await chats.participants(orgId, chatId);
      this.assertActive(users, actor.id);
      const now = new Date();
      await chats.markLeft(orgId, chatId, actor.id, now);
      const remaining = users.map((user) =>
        user.orgUserId === actor.id ? { ...user, leftAt: now } : user,
      );
      await outbox.append([this.updatedEvent(orgId, actor, current, remaining)]);
      return current;
    });
    this.logger.info('chat left', { orgId, chatId });
    return saved;
  }

  async accept(orgId: string, actor: Actor, chatId: string): Promise<Chat> {
    const chat = await this.mustChat(this.repo, orgId, chatId);
    await this.requireActor(orgId, actor, chat.communityId);
    await this.requireActive(this.repo, orgId, chat.id, actor.id);
    if (chat.createdBy === actor.id) {
      throw new ForbiddenError('You cannot accept this request');
    }
    if (chat.kind !== 'direct' || chat.status !== 'pending') {
      throw new ConflictError('This chat is not a request');
    }
    const saved = await this.uow.run(async ({ chats, outbox }) => {
      const current = await this.mustChat(chats, orgId, chatId);
      if (current.kind !== 'direct' || current.status !== 'pending') {
        throw new ConflictError('This chat is not a request');
      }
      const next = await this.mustUpdate(chats, orgId, chatId, { status: 'open' });
      const users = await chats.participants(orgId, chatId);
      await outbox.append([this.updatedEvent(orgId, actor, next, users)]);
      return next;
    });
    this.logger.info('chat accepted', { orgId, chatId });
    return saved;
  }

  async send(
    orgId: string,
    actor: Actor,
    chatId: string,
    input: SendMessageInput,
  ): Promise<MessageView> {
    const preview = await this.mustChat(this.repo, orgId, chatId);
    await this.requireActor(orgId, actor, preview.communityId);
    const settings = await this.requireSettings(orgId, preview.communityId);
    if (!settings.enabled) {
      throw new ForbiddenError('Direct messages are off');
    }
    const saved = await this.uow.run(async ({ chats, outbox }) => {
      const chat = await this.mustChat(chats, orgId, chatId);
      const users = await chats.participants(orgId, chatId);
      await this.assertMaySend(chats, orgId, actor, chat, users, settings, input);
      const written = await this.writeMessage(chats, orgId, actor, chat, input);
      const events: NewDiscussionEvent[] = [];
      if (written.opened) {
        events.push(this.updatedEvent(orgId, actor, written.chat, users));
      }
      events.push(this.sentEvent(orgId, actor, written.chat, written.message));
      await outbox.append(events);
      return written.message;
    });
    this.logger.info('message sent', { orgId, chatId, messageId: saved.id });
    return this.viewOf(orgId, actor, saved);
  }

  async editMessage(
    orgId: string,
    actor: Actor,
    messageId: string,
    body: string,
  ): Promise<MessageView> {
    const message = await this.mustMessage(this.repo, orgId, messageId);
    await this.requireWritableChat(orgId, actor, message.chatId);
    if (message.orgUserId !== actor.id) {
      throw new ForbiddenError('You can change only your own message');
    }
    if (message.deletedAt) {
      throw new ConflictError('This message was deleted');
    }
    if (message.body === body) {
      return this.viewOf(orgId, actor, message);
    }
    const saved = await this.repo.updateMessage(orgId, messageId, { body, editedAt: new Date() });
    if (!saved) {
      throw new NotFoundError('Message', messageId);
    }
    this.logger.info('message edited', { orgId, messageId });
    return this.viewOf(orgId, actor, saved);
  }

  async deleteMessage(orgId: string, actor: Actor, messageId: string): Promise<MessageView> {
    const message = await this.mustMessage(this.repo, orgId, messageId);
    await this.requireActor(orgId, actor, message.communityId);
    if (!isStaffRole(actor.role)) {
      if (message.orgUserId !== actor.id) {
        throw new ForbiddenError('You cannot delete this message');
      }
      await this.requireWritableChat(orgId, actor, message.chatId);
    }
    if (message.deletedAt) {
      throw new ConflictError('This message was deleted');
    }
    const now = new Date();
    const saved = await this.uow.run(async ({ chats, outbox }) => {
      const next = await chats.updateMessage(orgId, messageId, { deletedAt: now });
      if (!next) {
        throw new NotFoundError('Message', messageId);
      }
      await chats.resolveFlags(orgId, messageId, {
        resolvedAt: now,
        resolvedBy: actor.id,
        resolution: 'deleted',
      });
      await outbox.append([
        discussionEvents.messageDeleted.make({
          orgId,
          data: next,
          metadata: this.meta(actor),
        }),
      ]);
      return next;
    });
    this.logger.info('message deleted', { orgId, messageId });
    return this.viewOf(orgId, actor, saved);
  }

  async setReaction(
    orgId: string,
    actor: Actor,
    messageId: string,
    emoji: ReactionEmoji | null,
  ): Promise<void> {
    const message = await this.mustMessage(this.repo, orgId, messageId);
    await this.requireActor(orgId, actor, message.communityId);
    await this.requireActive(this.repo, orgId, message.chatId, actor.id);
    await this.repo.setReaction(orgId, message.communityId, messageId, actor.id, emoji);
    this.logger.debug('message reaction set', { orgId, messageId });
  }

  async markRead(orgId: string, actor: Actor, chatId: string, messageId: string): Promise<void> {
    const chat = await this.mustChat(this.repo, orgId, chatId);
    await this.requireActor(orgId, actor, chat.communityId);
    await this.requireActive(this.repo, orgId, chat.id, actor.id);
    const message = await this.mustMessage(this.repo, orgId, messageId);
    if (message.chatId !== chatId) {
      throw new NotFoundError('Message', messageId);
    }
    await this.repo.setRead(orgId, chatId, actor.id, messageId);
    this.logger.debug('chat marked read', { orgId, chatId, messageId });
  }

  async mute(orgId: string, actor: Actor, chatId: string, until?: Date): Promise<void> {
    const chat = await this.mustChat(this.repo, orgId, chatId);
    await this.requireActor(orgId, actor, chat.communityId);
    await this.requireActive(this.repo, orgId, chat.id, actor.id);
    await this.repo.setMuted(orgId, chatId, actor.id, { until: until ?? null });
    this.logger.debug('chat muted', { orgId, chatId });
  }

  async unmute(orgId: string, actor: Actor, chatId: string): Promise<void> {
    const chat = await this.mustChat(this.repo, orgId, chatId);
    await this.requireActor(orgId, actor, chat.communityId);
    await this.requireActive(this.repo, orgId, chat.id, actor.id);
    await this.repo.setMuted(orgId, chatId, actor.id, null);
    this.logger.debug('chat unmuted', { orgId, chatId });
  }

  async block(orgId: string, actor: Actor, communityId: string, orgUserId: string): Promise<void> {
    if (actor.id === orgUserId) {
      throw new ConflictError('You cannot block yourself');
    }
    await this.requireSettings(orgId, communityId);
    await this.requireActor(orgId, actor, communityId);
    const closed = await this.uow.run(async ({ chats, outbox }) => {
      await chats.lockDirectPair(orgId, communityId, actor.id, orgUserId);
      await chats.block(orgId, communityId, actor.id, orgUserId);
      const direct = await chats.findDirect(orgId, communityId, actor.id, orgUserId);
      if (!direct || direct.status === 'closed') {
        return null;
      }
      const next = await this.mustUpdate(chats, orgId, direct.id, { status: 'closed' });
      const users = await chats.participants(orgId, direct.id);
      await outbox.append([this.updatedEvent(orgId, actor, next, users)]);
      return next;
    });
    this.logger.info('user blocked', { orgId, communityId, chatId: closed?.id ?? null });
  }

  async unblock(
    orgId: string,
    actor: Actor,
    communityId: string,
    orgUserId: string,
  ): Promise<void> {
    if (actor.id === orgUserId) {
      throw new ConflictError('You cannot block yourself');
    }
    await this.requireSettings(orgId, communityId);
    await this.requireActor(orgId, actor, communityId);
    const opened = await this.uow.run(async ({ chats, outbox }) => {
      await chats.lockDirectPair(orgId, communityId, actor.id, orgUserId);
      await chats.unblock(orgId, communityId, actor.id, orgUserId);
      const direct = await chats.findDirect(orgId, communityId, actor.id, orgUserId);
      if (!direct || direct.status !== 'closed' || direct.lockedAt) {
        return null;
      }
      if (await chats.isBlocked(orgId, communityId, actor.id, orgUserId)) {
        return null;
      }
      const next = await this.mustUpdate(chats, orgId, direct.id, { status: 'open' });
      const users = await chats.participants(orgId, direct.id);
      await outbox.append([this.updatedEvent(orgId, actor, next, users)]);
      return next;
    });
    this.logger.info('user unblocked', { orgId, communityId, chatId: opened?.id ?? null });
  }

  async flagMessage(
    orgId: string,
    actor: Actor,
    messageId: string,
    reason: string,
  ): Promise<MessageFlag> {
    const message = await this.mustMessage(this.repo, orgId, messageId);
    await this.requireActor(orgId, actor, message.communityId);
    await this.requireActive(this.repo, orgId, message.chatId, actor.id);
    const now = new Date();
    const saved = await this.uow.run(async ({ chats, outbox }) => {
      const flag = await chats.insertFlag(orgId, {
        orgId,
        id: genId('messageFlag'),
        communityId: message.communityId,
        messageId,
        orgUserId: actor.id,
        reason,
        resolvedAt: null,
        resolution: null,
        resolvedBy: null,
        createdAt: now,
        updatedAt: now,
      });
      if (!flag) {
        const existing = await chats.findFlag(orgId, messageId, actor.id);
        if (!existing) {
          throw new NotFoundError('Message', messageId);
        }
        return existing;
      }
      await outbox.append([
        discussionEvents.messageReported.make({
          orgId,
          data: flag,
          metadata: this.meta(actor),
        }),
      ]);
      return flag;
    });
    this.logger.info('message flagged', { orgId, messageId });
    return saved;
  }

  async resolveMessageFlags(
    orgId: string,
    actor: Actor,
    messageId: string,
    resolution: Extract<MessageFlagResolution, 'dismissed'>,
  ): Promise<void> {
    if (!isStaffRole(actor.role)) {
      throw new ForbiddenError('You cannot work this queue');
    }
    const message = await this.mustMessage(this.repo, orgId, messageId);
    await this.requireActor(orgId, actor, message.communityId);
    await this.repo.resolveFlags(orgId, messageId, {
      resolvedAt: new Date(),
      resolvedBy: actor.id,
      resolution,
    });
    this.logger.info('message flags resolved', {
      orgId,
      communityId: message.communityId,
      messageId,
      resolution,
    });
  }

  async lock(orgId: string, actor: Actor, chatId: string): Promise<Chat> {
    return this.setLock(orgId, actor, chatId, true);
  }

  async unlock(orgId: string, actor: Actor, chatId: string): Promise<Chat> {
    return this.setLock(orgId, actor, chatId, false);
  }

  async listChats(orgId: string, actor: Actor, communityId: string): Promise<ChatListItem[]> {
    await this.requireSettings(orgId, communityId);
    await this.requireActor(orgId, actor, communityId);
    const items = await this.repo.listForUser(orgId, communityId, actor.id);
    this.logger.debug('chats listed', { orgId, communityId, count: items.length });
    return items;
  }

  async messages(
    orgId: string,
    actor: Actor,
    chatId: string,
    query: { page: number; pageSize: number },
  ): Promise<Page<MessageView>> {
    const chat = await this.mustChat(this.repo, orgId, chatId);
    await this.requireActor(orgId, actor, chat.communityId);
    await this.requireActive(this.repo, orgId, chat.id, actor.id);
    const page = await this.repo.listMessages(orgId, chatId, query);
    this.logger.debug('chat messages read', { orgId, chatId });
    return {
      ...page,
      rows: await this.withSenders(orgId, actor, page.rows),
    };
  }

  async messageQueue(orgId: string, actor: Actor, communityId: string): Promise<MessageQueue> {
    if (!isStaffRole(actor.role)) {
      throw new ForbiddenError('You cannot work this queue');
    }
    await this.requireActor(orgId, actor, communityId);
    await this.requireSettings(orgId, communityId);
    const flags = await this.repo.listOpenFlags(orgId, communityId);
    const messages = await this.repo.messagesByIds(orgId, [
      ...new Set(flags.map((flag) => flag.messageId)),
    ]);
    const summaries = await this.repo.chatSummaries(orgId, [
      ...new Set(messages.map((message) => message.chatId)),
    ]);
    const byChat = new Map(summaries.map((summary) => [summary.chat.id, summary]));
    const views = await this.withSenders(orgId, actor, messages);
    const entries: MessageQueueEntry[] = views.flatMap((message) => {
      const summary = byChat.get(message.chatId);
      if (!summary) {
        return [];
      }
      return [
        {
          message,
          flags: flags.filter((flag) => flag.messageId === message.id),
          chat: summary.chat,
          participantIds: summary.participantIds,
        },
      ];
    });
    this.logger.debug('message queue read', { orgId, communityId, count: entries.length });
    return { entries };
  }

  async chatSummary(
    orgId: string,
    chatId: string,
  ): Promise<{ chat: Chat; participants: ChatUser[] } | null> {
    const chat = await this.repo.findChat(orgId, chatId);
    if (!chat) {
      return null;
    }
    const participants = await this.repo.participants(orgId, chatId);
    return { chat, participants };
  }

  async latestMessageBody(orgId: string, chatId: string): Promise<string | null> {
    const page = await this.repo.listMessages(orgId, chatId, { page: 1, pageSize: 1 });
    return page.rows[0]?.body ?? null;
  }

  isBlocked(orgId: string, communityId: string, a: string, b: string): Promise<boolean> {
    return this.repo.isBlocked(orgId, communityId, a, b);
  }

  private async setLock(
    orgId: string,
    actor: Actor,
    chatId: string,
    locked: boolean,
  ): Promise<Chat> {
    if (!isStaffRole(actor.role)) {
      throw new ForbiddenError('You cannot lock this chat');
    }
    const chat = await this.mustChat(this.repo, orgId, chatId);
    await this.requireActor(orgId, actor, chat.communityId);
    if (Boolean(chat.lockedAt) === locked) {
      return chat;
    }
    const now = new Date();
    const saved = await this.uow.run(async ({ chats, outbox }) => {
      const next = await this.mustUpdate(chats, orgId, chatId, {
        lockedAt: locked ? now : null,
        lockedBy: locked ? actor.id : null,
      });
      if (locked) {
        await chats.resolveOpenFlagsForChat(orgId, chatId, {
          resolvedAt: now,
          resolvedBy: actor.id,
          resolution: 'locked',
        });
      }
      const users = await chats.participants(orgId, chatId);
      await outbox.append([this.updatedEvent(orgId, actor, next, users)]);
      return next;
    });
    this.logger.info(locked ? 'chat locked' : 'chat unlocked', { orgId, chatId });
    return saved;
  }

  private async requireSettings(orgId: string, communityId: string): Promise<DmSettings> {
    const settings = await this.content.getDmSettings(orgId, communityId);
    if (!settings) {
      throw new NotFoundError('Community', communityId);
    }
    return settings;
  }

  private async requireActor(orgId: string, actor: Actor, communityId: string): Promise<void> {
    if (!(await this.access.isCommunityMember(orgId, actor, communityId))) {
      throw new ForbiddenError('You are not a member of this community');
    }
  }

  private async requirePerson(
    orgId: string,
    communityId: string,
    orgUserId: string,
  ): Promise<Role> {
    const role = await this.personRole(orgId, communityId, orgUserId);
    if (!role) {
      throw new ForbiddenError('That person is not a member of this community');
    }
    return role;
  }

  private async personRole(
    orgId: string,
    communityId: string,
    orgUserId: string,
  ): Promise<Role | null> {
    const role = await this.authors.roleOf(orgId, orgUserId);
    if (!role) {
      return null;
    }
    const member = await this.access.isCommunityMember(orgId, { id: orgUserId, role }, communityId);
    return member ? role : null;
  }

  private async personRoles(
    orgId: string,
    communityId: string,
    orgUserIds: string[],
  ): Promise<Record<string, Role>> {
    const roles = await this.authors.rolesOf(orgId, orgUserIds);
    const members = new Set(
      await this.access.communityMembersAmong(orgId, communityId, Object.keys(roles)),
    );
    return Object.fromEntries(
      Object.entries(roles).filter(([orgUserId]) => members.has(orgUserId)),
    );
  }

  private async assertMaySend(
    chats: ChatRepository,
    orgId: string,
    actor: Actor,
    chat: Chat,
    users: ChatUser[],
    settings: DmSettings,
    input: SendMessageInput,
  ): Promise<void> {
    this.assertActive(users, actor.id);
    if (chat.lockedAt) {
      throw new ForbiddenError('This chat is locked');
    }
    if (chat.status === 'closed') {
      throw new ForbiddenError('You cannot send in this chat');
    }
    if (this.pendingCreator(chat, actor)) {
      throw new ForbiddenError('You cannot send in this chat');
    }
    const others = users
      .filter(
        (other) =>
          other.orgUserId !== actor.id && (chat.kind === 'direct' || other.leftAt === null),
      )
      .map((other) => other.orgUserId);
    if (others.length > 0) {
      const roles = await this.personRoles(orgId, chat.communityId, others);
      const recipients = chat.kind === 'group' ? others.filter((other) => roles[other]) : others;
      for (const other of recipients) {
        const role = roles[other];
        if (!role || !this.mayMessage(settings, actor, role)) {
          throw new ForbiddenError('You cannot send in this chat');
        }
      }
      if (recipients.length > 0) {
        const blocked = await chats.blockedWith(orgId, chat.communityId, actor.id, recipients);
        if (blocked.length > 0) {
          throw new ForbiddenError('You cannot send in this chat');
        }
      }
    }
    if (input.replyToId) {
      const reply = await chats.findMessage(orgId, input.replyToId);
      if (!reply || reply.chatId !== chat.id) {
        throw new NotFoundError('Message', input.replyToId);
      }
    }
    await this.requireOwnedImages(orgId, actor.id, input.assetIds);
  }

  private async writeMessage(
    chats: ChatRepository,
    orgId: string,
    actor: Actor,
    chat: Chat,
    input: SendMessageInput,
  ): Promise<{ chat: Chat; message: Message; opened: boolean }> {
    const opened =
      chat.kind === 'direct' && chat.status === 'pending' && chat.createdBy !== actor.id;
    const current = opened
      ? await this.mustUpdate(chats, orgId, chat.id, { status: 'open' })
      : chat;
    const message = await chats.insertMessage(
      orgId,
      this.newMessage(orgId, current, actor, input, new Date()),
    );
    if (input.assetIds.length > 0) {
      await chats.attach(orgId, current.communityId, message.id, input.assetIds);
    }
    return { chat: current, message, opened };
  }

  private assertMayMessage(settings: DmSettings, actor: Actor, role: Role): void {
    if (!settings.enabled) {
      throw new ForbiddenError('Direct messages are off');
    }
    if (!this.mayMessage(settings, actor, role)) {
      throw new ForbiddenError('You cannot message this person');
    }
  }

  private assertGroup(settings: DmSettings): void {
    if (!settings.enabled) {
      throw new ForbiddenError('Direct messages are off');
    }
    if (!settings.groupChats) {
      throw new ForbiddenError('Group chats are off');
    }
  }

  private mayMessage(settings: DmSettings, actor: Actor, target: Role): boolean {
    if (isStaffRole(actor.role)) {
      return settings.staffToAnyone;
    }
    if (isStaffRole(target)) {
      return settings.memberToStaff;
    }
    return settings.memberToMember;
  }

  private async requireActive(
    repo: ChatRepository,
    orgId: string,
    chatId: string,
    orgUserId: string,
  ): Promise<void> {
    const users = await repo.participants(orgId, chatId);
    this.assertActive(users, orgUserId);
  }

  private assertActive(users: ChatUser[], orgUserId: string): void {
    if (!users.some((user) => user.orgUserId === orgUserId && user.leftAt === null)) {
      throw new ForbiddenError('You are not in this chat');
    }
  }

  private async requireOwnedImages(
    orgId: string,
    orgUserId: string,
    assetIds: string[],
  ): Promise<void> {
    for (const assetId of assetIds) {
      if (!(await this.images.ownsImage(orgId, assetId, orgUserId))) {
        this.logger.debug('attachment refused', { orgId, orgUserId, assetId });
        throw new NotFoundError('Asset', assetId);
      }
    }
  }

  private async requireWritableChat(orgId: string, actor: Actor, chatId: string): Promise<void> {
    const chat = await this.mustChat(this.repo, orgId, chatId);
    await this.requireActor(orgId, actor, chat.communityId);
    await this.requireActive(this.repo, orgId, chat.id, actor.id);
    if (chat.lockedAt || chat.status === 'closed') {
      throw new ForbiddenError('You cannot send in this chat');
    }
  }

  private pendingCreator(chat: Chat, actor: Actor): boolean {
    return chat.kind === 'direct' && chat.status === 'pending' && chat.createdBy === actor.id;
  }

  private async mustChat(repo: ChatRepository, orgId: string, chatId: string): Promise<Chat> {
    const chat = await repo.findChat(orgId, chatId);
    if (!chat) {
      throw new NotFoundError('Chat', chatId);
    }
    return chat;
  }

  private async mustMessage(
    repo: ChatRepository,
    orgId: string,
    messageId: string,
  ): Promise<Message> {
    const message = await repo.findMessage(orgId, messageId);
    if (!message) {
      throw new NotFoundError('Message', messageId);
    }
    return message;
  }

  private async mustUpdate(
    chats: ChatRepository,
    orgId: string,
    chatId: string,
    patch: Partial<Pick<Chat, 'status' | 'lockedAt' | 'lockedBy'>>,
  ): Promise<Chat> {
    const next = await chats.updateChat(orgId, chatId, patch);
    if (!next) {
      throw new NotFoundError('Chat', chatId);
    }
    return next;
  }

  private memberRow(
    orgId: string,
    communityId: string,
    chatId: string,
    orgUserId: string,
    now: Date,
  ): ChatUser {
    return {
      orgId,
      communityId,
      chatId,
      orgUserId,
      joinedAt: now,
      leftAt: null,
      lastReadMessageId: null,
      mute: null,
      createdAt: now,
      updatedAt: now,
    };
  }

  private newMessage(
    orgId: string,
    chat: Chat,
    actor: Actor,
    input: SendMessageInput,
    now: Date,
  ): Message {
    return {
      orgId,
      id: genId('message'),
      communityId: chat.communityId,
      chatId: chat.id,
      orgUserId: actor.id,
      body: input.body,
      replyToId: input.replyToId,
      editedAt: null,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    };
  }

  private activeIds(users: ChatUser[]): string[] {
    return users
      .filter((user) => user.leftAt === null)
      .map((user) => user.orgUserId)
      .sort();
  }

  private chatData(chat: Chat, users: ChatUser[]) {
    return { ...chat, participantIds: this.activeIds(users) };
  }

  private meta(actor: Actor) {
    return { actorOrgUserId: actor.id };
  }

  private createdEvent(orgId: string, actor: Actor, chat: Chat, users: ChatUser[]) {
    return discussionEvents.chatCreated.make({
      orgId,
      data: this.chatData(chat, users),
      metadata: this.meta(actor),
    });
  }

  private updatedEvent(orgId: string, actor: Actor, chat: Chat, users: ChatUser[]) {
    return discussionEvents.chatUpdated.make({
      orgId,
      data: this.chatData(chat, users),
      metadata: this.meta(actor),
    });
  }

  private addedEvent(orgId: string, actor: Actor, chat: Chat, orgUserId: string) {
    return discussionEvents.chatParticipantAdded.make({
      orgId,
      data: {
        chatId: chat.id,
        communityId: chat.communityId,
        orgUserId,
        addedBy: actor.id,
      },
      metadata: this.meta(actor),
    });
  }

  private sentEvent(orgId: string, actor: Actor, chat: Chat, message: Message) {
    return discussionEvents.messageSent.make({
      orgId,
      data: message,
      metadata: { ...this.meta(actor), chatStatus: chat.status },
    });
  }

  private async viewOf(orgId: string, actor: Actor, message: Message): Promise<MessageView> {
    const [view] = await this.withSenders(orgId, actor, [message]);
    return view!;
  }

  private async withSenders(
    orgId: string,
    actor: Actor,
    messages: Message[],
  ): Promise<MessageView[]> {
    if (messages.length === 0) {
      return [];
    }
    const [records, attached] = await Promise.all([
      this.profiles.authorsOf(orgId, [...new Set(messages.map((message) => message.orgUserId))]),
      this.repo.attachmentsOf(
        orgId,
        messages.map((message) => message.id),
      ),
    ]);
    const shown = (message: Message) =>
      message.deletedAt !== null && !isStaffRole(actor.role) ? [] : (attached[message.id] ?? []);
    const urls = await this.assetUrls.urls(orgId, [
      ...messages.flatMap(shown),
      ...authorImageIds(orgId, Object.values(records)),
    ]);
    return messages.map((message) => {
      const record = records[message.orgUserId];
      if (!record) {
        throw new NotFoundError('OrgUser', message.orgUserId);
      }
      return {
        ...this.present(message, actor),
        sender: authorView(orgId, record, urls),
        attachments: shown(message).flatMap((assetId) => {
          const url = urls[assetId];
          return url ? [{ assetId, url }] : [];
        }),
      };
    });
  }

  private present(message: Message, actor: Actor): Message {
    if (message.deletedAt !== null && !isStaffRole(actor.role)) {
      return { ...message, body: '' };
    }
    return message;
  }
}
