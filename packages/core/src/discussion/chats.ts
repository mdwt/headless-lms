import { genId } from '../shared/id.js';
import {
  ConflictError,
  ForbiddenError,
  InvalidInputError,
  NotFoundError,
  UnavailableError,
} from '../shared/errors.js';
import type { Logger, PubSub } from '../shared/ports.js';
import { noopLogger } from '../shared/logger.js';
import type { DmSettings } from '../content/index.js';
import type { AssetFiles, FileUrls, MemberImageReader } from '../assets/index.js';
import type {
  Chat,
  ChatLiveEvent,
  ChatUnreadSummary,
  ChatUser,
  LiveMessage,
  Message,
  MessageFlag,
  MessageFlagResolution,
  MessageView,
  Page,
  ReactionCounts,
  ReactionEmoji,
} from '../types/index.js';
import type { Actor } from '../shared/actor.js';
import type { NewDiscussionEvent } from './events.js';
import { discussionEvents } from './events.js';
import { authorName, authorView } from './authors.js';
import { activeSubscription } from './subscriptions.js';
import { keepAllowed, mentionTokens, mentionViews } from './mentions.js';
import { isTeam, teamBadge } from './rules.js';
import { ChatHub, TYPING, publishChange, type ChatHubOptions } from './live.js';
import type { CommentAuthor } from './model.js';
import type {
  AuthorPermissionReader,
  AuthorProfileReader,
  ChatInboxRow,
  ChatListItem,
  ChatListQuery,
  ChatLiveReads,
  ChatMemberStates,
  ChatRepository,
  ChatService,
  ChatUnread,
  ChatUnitOfWork,
  LiveChat,
  LiveSession,
  MentionsRepository,
  MessageQueue,
  MessageQueueEntry,
  MessageReactions,
  SendMessageInput,
  StartDirectInput,
  StartGroupInput,
  CommunityAccess,
  SpaceReader,
  SubscriptionsRepository,
} from './ports.js';
import { MODERATION_QUEUE_LIMIT } from './ports.js';

const TYPING_FOR_MS = 5000;
const TYPING_REPEAT_MS = 2000;

export type ChatServiceParams = {
  repo: ChatRepository;
  access: CommunityAccess;
  content: Pick<SpaceReader, 'getDmSettings'>;
  authors: AuthorPermissionReader;
  profiles: AuthorProfileReader;
  subscriptions: SubscriptionsRepository;
  mentions: MentionsRepository;
  images: MemberImageReader & Pick<AssetFiles, 'signFile'>;
  fileUrls: FileUrls;
  uow: ChatUnitOfWork;
  pubsub?: PubSub;
  live?: ChatHubOptions;
  logger?: Logger;
};

function eventMessage(message: Message): Omit<Message, 'clientId'> {
  const { clientId: _clientId, ...rest } = message;
  return rest;
}

export class ChatServiceImpl implements ChatService, ChatLiveReads {
  /** This process's live chat hub; null without a PubSub. */
  readonly hub: ChatHub | null;
  private readonly repo: ChatRepository;
  private readonly access: CommunityAccess;
  private readonly content: Pick<SpaceReader, 'getDmSettings'>;
  private readonly authors: AuthorPermissionReader;
  private readonly profiles: AuthorProfileReader;
  private readonly subscriptions: SubscriptionsRepository;
  private readonly mentions: MentionsRepository;
  private readonly images: MemberImageReader & Pick<AssetFiles, 'signFile'>;
  private readonly fileUrls: FileUrls;
  private readonly uow: ChatUnitOfWork;
  private readonly pubsub: PubSub | null;
  private readonly logger: Logger;
  private readonly typed = new Map<string, number>();

  constructor(params: ChatServiceParams) {
    this.repo = params.repo;
    this.access = params.access;
    this.content = params.content;
    this.authors = params.authors;
    this.profiles = params.profiles;
    this.subscriptions = params.subscriptions;
    this.mentions = params.mentions;
    this.images = params.images;
    this.fileUrls = params.fileUrls;
    this.uow = params.uow;
    this.pubsub = params.pubsub ?? null;
    this.logger = params.logger ?? noopLogger;
    this.hub = this.pubsub
      ? new ChatHub({ pubsub: this.pubsub, reads: this, logger: this.logger, ...params.live })
      : null;
  }

  async startDirect(input: StartDirectInput, actor: Actor): Promise<Chat> {
    const orgId = actor.orgId;
    if (actor.id === input.orgUserId) {
      throw new InvalidInputError('You cannot message yourself');
    }
    if (input.body === null && input.assetIds.length > 0) {
      throw new InvalidInputError('An attachment needs a message');
    }
    const settings = await this.requireSettings(orgId, input.communityId);
    await this.requireActor(actor, input.communityId);
    const targetTeam = await this.requirePerson(orgId, input.communityId, input.orgUserId);
    const actorTeam = isTeam(actor.permissions, input.communityId);
    this.assertMayMessage(settings, actorTeam, targetTeam);
    const first: SendMessageInput | null =
      input.body === null ? null : { body: input.body, replyToId: null, assetIds: input.assetIds };
    const saved = await this.uow.run(async ({ chats, mentions, outbox }) => {
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
          ? await this.writeMessage(chats, mentions, orgId, actor, existing, present, first)
          : null;
        const chat = written?.chat ?? existing;
        const events: NewDiscussionEvent[] = [];
        if (rejoin || written?.opened) {
          events.push(this.updatedEvent(orgId, actor, chat, present));
        }
        if (written) {
          events.push(
            this.sentEvent(orgId, actor, written.chat, written.message, written.mentioned),
          );
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
      const request = settings.firstMessageIsRequest && !actorTeam && !targetTeam;
      if (request && !first) {
        throw new InvalidInputError('A message request needs a message');
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
        const written = await this.writeMessage(chats, mentions, orgId, actor, chat, users, first);
        events.push(this.sentEvent(orgId, actor, written.chat, written.message, written.mentioned));
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
        actorId: actor.id,
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

  async startGroup(input: StartGroupInput, actor: Actor): Promise<Chat> {
    const orgId = actor.orgId;
    const settings = await this.requireSettings(orgId, input.communityId);
    this.assertGroup(settings);
    await this.requireActor(actor, input.communityId);
    const others = [...new Set(input.orgUserIds.filter((id) => id !== actor.id))].sort();
    if (others.length < 2) {
      throw new InvalidInputError('A group chat needs three people');
    }
    if (others.length + 1 > settings.groupSize) {
      throw new ConflictError('This group is full');
    }
    const actorTeam = isTeam(actor.permissions, input.communityId);
    for (const orgUserId of others) {
      const targetTeam = await this.requirePerson(orgId, input.communityId, orgUserId);
      this.assertMayMessage(settings, actorTeam, targetTeam);
    }
    const saved = await this.uow.run(async ({ chats, outbox }) => {
      if (await chats.anyBlockedAmong(orgId, input.communityId, [actor.id, ...others])) {
        throw new ForbiddenError('You cannot message this person');
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
      actorId: actor.id,
    });
    return saved;
  }

  async addParticipant(chatId: string, orgUserId: string, actor: Actor): Promise<Chat> {
    const orgId = actor.orgId;
    const chat = await this.mustChat(this.repo, orgId, chatId);
    await this.requireActor(actor, chat.communityId);
    await this.requireActive(this.repo, orgId, chat.id, actor.id);
    if (chat.kind !== 'group') {
      throw new ConflictError('This chat is not a group');
    }
    const settings = await this.requireSettings(orgId, chat.communityId);
    this.assertGroup(settings);
    const targetTeam = await this.requirePerson(orgId, chat.communityId, orgUserId);
    this.assertMayMessage(settings, isTeam(actor.permissions, chat.communityId), targetTeam);
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
        throw new ForbiddenError('You cannot message this person');
      }
      const now = new Date();
      await chats.join(
        orgId,
        this.memberRow(orgId, current.communityId, current.id, orgUserId, now),
      );
      await outbox.append([this.addedEvent(orgId, actor, current, orgUserId)]);
      return current;
    });
    this.logger.info('chat participant added', { orgId, chatId, orgUserId, actorId: actor.id });
    return saved;
  }

  async leave(chatId: string, actor: Actor): Promise<Chat> {
    const orgId = actor.orgId;
    const chat = await this.mustChat(this.repo, orgId, chatId);
    await this.requireActor(actor, chat.communityId);
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
    this.logger.info('chat left', { orgId, chatId, actorId: actor.id });
    return saved;
  }

  async accept(chatId: string, actor: Actor): Promise<Chat> {
    const orgId = actor.orgId;
    const chat = await this.mustChat(this.repo, orgId, chatId);
    await this.requireActor(actor, chat.communityId);
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
    this.logger.info('chat accepted', { orgId, chatId, actorId: actor.id });
    return saved;
  }

  async send(chatId: string, input: SendMessageInput, actor: Actor): Promise<MessageView> {
    const orgId = actor.orgId;
    const preview = await this.mustChat(this.repo, orgId, chatId);
    await this.requireActor(actor, preview.communityId);
    const settings = await this.requireSettings(orgId, preview.communityId);
    if (!settings.enabled) {
      throw new ForbiddenError('Direct messages are off');
    }
    const clientId = input.clientId;
    let saved: { message: Message; repeat: boolean };
    try {
      saved = await this.uow.run(async ({ chats, mentions, outbox }) => {
        const chat = await this.mustChat(chats, orgId, chatId);
        if (clientId) {
          const stored = await chats.findByClientId(orgId, chatId, actor.id, clientId);
          if (stored) {
            return { message: stored, repeat: true };
          }
        }
        const users = await chats.participants(orgId, chatId);
        await this.assertMaySend(chats, orgId, actor, chat, users, settings, input);
        const written = await this.writeMessage(chats, mentions, orgId, actor, chat, users, input);
        const events: NewDiscussionEvent[] = [];
        if (written.opened) {
          events.push(this.updatedEvent(orgId, actor, written.chat, users));
        }
        events.push(this.sentEvent(orgId, actor, written.chat, written.message, written.mentioned));
        await outbox.append(events);
        return { message: written.message, repeat: false };
      });
    } catch (error) {
      const stored =
        clientId && error instanceof ConflictError
          ? await this.repo.findByClientId(orgId, chatId, actor.id, clientId)
          : null;
      if (!stored) {
        throw error;
      }
      saved = { message: stored, repeat: true };
    }
    if (saved.repeat) {
      this.logger.debug('message send repeated', {
        orgId,
        chatId,
        messageId: saved.message.id,
      });
    } else {
      this.logger.info('message sent', {
        orgId,
        chatId,
        messageId: saved.message.id,
        actorId: actor.id,
      });
    }
    return this.viewOf(actor, saved.message);
  }

  async editMessage(messageId: string, body: string, actor: Actor): Promise<MessageView> {
    const orgId = actor.orgId;
    const message = await this.mustMessage(this.repo, orgId, messageId);
    await this.requireWritableChat(actor, message.chatId);
    if (message.orgUserId !== actor.id) {
      throw new ForbiddenError('You can change only your own message');
    }
    if (message.deletedAt) {
      throw new ConflictError('This message was deleted');
    }
    if (message.body === body) {
      return this.viewOf(actor, message);
    }
    const now = new Date();
    const saved = await this.uow.run(async ({ chats, mentions, outbox }) => {
      const next = await chats.updateMessage(orgId, messageId, { body, editedAt: now });
      if (!next) {
        throw new NotFoundError('Message', messageId);
      }
      const chat = await this.mustChat(chats, orgId, next.chatId);
      const users = await chats.participants(orgId, next.chatId);
      const candidates = this.mentionable(body, users);
      const added = await mentions.sync(orgId, 'message', messageId, candidates, now);
      await outbox.append([
        discussionEvents.messageUpdated.make({
          orgId,
          data: { ...eventMessage(next), mentionedOrgUserIds: keepAllowed(candidates, added) },
          metadata: { ...this.meta(actor), chatStatus: chat.status },
        }),
      ]);
      return next;
    });
    this.logger.info('message edited', { orgId, messageId, actorId: actor.id });
    return this.viewOf(actor, saved);
  }

  async deleteMessage(messageId: string, actor: Actor): Promise<MessageView> {
    const orgId = actor.orgId;
    const message = await this.mustMessage(this.repo, orgId, messageId);
    await this.requireActor(actor, message.communityId);
    if (!actor.permissions.has('communities:moderate', message.communityId)) {
      if (message.orgUserId !== actor.id) {
        this.logger.warn('message delete refused — not the sender or a moderator', {
          orgId,
          messageId,
          actorId: actor.id,
        });
        throw new ForbiddenError('You cannot delete this message');
      }
      await this.requireWritableChat(actor, message.chatId);
    }
    if (message.deletedAt) {
      throw new ConflictError('This message was deleted');
    }
    const now = new Date();
    const saved = await this.uow.run(async ({ chats, mentions, outbox }) => {
      const next = await chats.updateMessage(orgId, messageId, { deletedAt: now });
      if (!next) {
        throw new NotFoundError('Message', messageId);
      }
      await mentions.removeItem(orgId, 'message', messageId);
      await chats.resolveFlags(orgId, messageId, {
        resolvedAt: now,
        resolvedBy: actor.id,
        resolution: 'deleted',
      });
      await outbox.append([
        discussionEvents.messageDeleted.make({
          orgId,
          data: eventMessage(next),
          metadata: this.meta(actor),
        }),
      ]);
      return next;
    });
    this.logger.info('message deleted', { orgId, messageId, actorId: actor.id });
    return this.viewOf(actor, saved);
  }

  async setReaction(
    messageId: string,
    emoji: ReactionEmoji | null,
    actor: Actor,
  ): Promise<MessageReactions> {
    const orgId = actor.orgId;
    const message = await this.mustMessage(this.repo, orgId, messageId);
    await this.requireActor(actor, message.communityId);
    await this.requireActive(this.repo, orgId, message.chatId, actor.id);
    await this.uow.run(async ({ chats, outbox }) => {
      const change = await chats.setReaction(
        orgId,
        message.communityId,
        messageId,
        actor.id,
        emoji,
      );
      if (!change.changed) {
        return;
      }
      const where = {
        messageId,
        chatId: message.chatId,
        communityId: message.communityId,
        orgUserId: actor.id,
      };
      const events: NewDiscussionEvent[] = [];
      if (change.inserted && emoji !== null) {
        events.push(
          discussionEvents.messageReactionAdded.make({
            orgId,
            data: { ...where, reaction: emoji },
            metadata: this.meta(actor),
          }),
        );
      }
      events.push(
        discussionEvents.messageReactionsChanged.make({
          orgId,
          data: { ...where, reaction: emoji },
          metadata: this.meta(actor),
        }),
      );
      await outbox.append(events);
    });
    this.logger.debug('message reaction set', { orgId, messageId });
    const counts = await this.repo.reactionsOf(orgId, [messageId], actor.id);
    return counts[messageId] ?? { reactions: {} };
  }

  async markRead(chatId: string, messageId: string, actor: Actor): Promise<void> {
    const orgId = actor.orgId;
    const chat = await this.mustChat(this.repo, orgId, chatId);
    await this.requireActor(actor, chat.communityId);
    await this.requireActive(this.repo, orgId, chat.id, actor.id);
    const message = await this.mustMessage(this.repo, orgId, messageId);
    if (message.chatId !== chatId) {
      throw new NotFoundError('Message', messageId);
    }
    const moved = await this.uow.run(async ({ chats, outbox }) => {
      if (!(await chats.setRead(orgId, chatId, actor.id, messageId))) {
        return false;
      }
      await outbox.append([
        discussionEvents.chatRead.make({
          orgId,
          data: {
            chatId,
            communityId: chat.communityId,
            orgUserId: actor.id,
            lastReadMessageId: messageId,
          },
          metadata: this.meta(actor),
        }),
      ]);
      return true;
    });
    this.logger.debug(moved ? 'chat marked read' : 'chat read mark kept', {
      orgId,
      chatId,
      messageId,
    });
  }

  async block(communityId: string, orgUserId: string, actor: Actor): Promise<void> {
    const orgId = actor.orgId;
    if (actor.id === orgUserId) {
      throw new InvalidInputError('You cannot block yourself');
    }
    await this.requireSettings(orgId, communityId);
    await this.requireActor(actor, communityId);
    await this.requirePerson(orgId, communityId, orgUserId);
    await this.uow.run(async ({ chats }) => {
      await chats.lockDirectPair(orgId, communityId, actor.id, orgUserId);
      await chats.block(orgId, communityId, actor.id, orgUserId);
    });
    this.logger.info('user blocked', { orgId, communityId, actorId: actor.id });
  }

  async unblock(communityId: string, orgUserId: string, actor: Actor): Promise<void> {
    const orgId = actor.orgId;
    if (actor.id === orgUserId) {
      throw new InvalidInputError('You cannot block yourself');
    }
    await this.requireSettings(orgId, communityId);
    await this.requireActor(actor, communityId);
    await this.uow.run(async ({ chats }) => {
      await chats.lockDirectPair(orgId, communityId, actor.id, orgUserId);
      await chats.unblock(orgId, communityId, actor.id, orgUserId);
    });
    this.logger.info('user unblocked', { orgId, communityId, actorId: actor.id });
  }

  async flagMessage(messageId: string, reason: string, actor: Actor): Promise<MessageFlag> {
    const orgId = actor.orgId;
    const message = await this.mustMessage(this.repo, orgId, messageId);
    await this.requireActor(actor, message.communityId);
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
    this.logger.info('message flagged', { orgId, messageId, actorId: actor.id });
    return saved;
  }

  async resolveMessageFlags(
    messageId: string,
    resolution: Extract<MessageFlagResolution, 'dismissed'>,
    communityId: string | null,
    actor: Actor,
  ): Promise<void> {
    const orgId = actor.orgId;
    const message = await this.mustMessage(this.repo, orgId, messageId);
    if (communityId !== null && message.communityId !== communityId) {
      throw new NotFoundError('Message', messageId);
    }
    this.requireModerator(actor, message.communityId, 'resolve message flags');
    await this.requireActor(actor, message.communityId);
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
      actorId: actor.id,
    });
  }

  async lock(chatId: string, communityId: string | null, actor: Actor): Promise<Chat> {
    return this.setLock(actor, chatId, true, communityId);
  }

  async unlock(chatId: string, communityId: string | null, actor: Actor): Promise<Chat> {
    return this.setLock(actor, chatId, false, communityId);
  }

  async listChats(
    communityId: string,
    query: ChatListQuery,
    actor: Actor,
  ): Promise<Page<ChatListItem>> {
    const orgId = actor.orgId;
    await this.requireSettings(orgId, communityId);
    await this.requireActor(actor, communityId);
    const page = await this.repo.listForUser(orgId, communityId, actor.id, query);
    const items = await this.listItems(actor, communityId, page.rows);
    this.logger.debug('chats listed', { orgId, communityId, count: items.length });
    return { ...page, rows: items };
  }

  async chat(chatId: string, actor: Actor): Promise<ChatListItem> {
    const orgId = actor.orgId;
    const chat = await this.mustChat(this.repo, orgId, chatId);
    await this.requireActor(actor, chat.communityId);
    await this.requireActive(this.repo, orgId, chat.id, actor.id);
    const row = await this.repo.inboxRow(orgId, chatId, actor.id);
    if (!row) {
      throw new NotFoundError('Chat', chatId);
    }
    const [item] = await this.listItems(actor, chat.communityId, [row]);
    this.logger.debug('chat read', { orgId, chatId });
    return item!;
  }

  async directChat(communityId: string, orgUserId: string, actor: Actor): Promise<ChatListItem> {
    const orgId = actor.orgId;
    await this.requireSettings(orgId, communityId);
    await this.requireActor(actor, communityId);
    const chat =
      orgUserId === actor.id
        ? null
        : await this.repo.findDirect(orgId, communityId, actor.id, orgUserId);
    const row = chat ? await this.repo.inboxRow(orgId, chat.id, actor.id) : null;
    if (!row) {
      throw new NotFoundError('Chat', orgUserId);
    }
    const [item] = await this.listItems(actor, communityId, [row]);
    this.logger.debug('direct chat read', { orgId, communityId, chatId: row.chat.id });
    return item!;
  }

  async unreadSummary(communityId: string, actor: Actor): Promise<ChatUnreadSummary> {
    const orgId = actor.orgId;
    await this.requireSettings(orgId, communityId);
    await this.requireActor(actor, communityId);
    return this.repo.unreadSummary(orgId, communityId, actor.id, new Date());
  }

  async typing(chatId: string, actor: Actor): Promise<void> {
    const orgId = actor.orgId;
    const chat = await this.mustChat(this.repo, orgId, chatId);
    await this.requireActor(actor, chat.communityId);
    await this.requireActive(this.repo, orgId, chat.id, actor.id);
    if (chat.lockedAt || chat.status === 'closed') {
      throw new ForbiddenError('You cannot send in this chat');
    }
    if (!this.pubsub) {
      return;
    }
    const now = Date.now();
    const key = `${orgId}:${chatId}:${actor.id}`;
    const last = this.typed.get(key);
    if (last !== undefined && now - last < TYPING_REPEAT_MS) {
      return;
    }
    this.typed.set(key, now);
    for (const [seen, at] of this.typed) {
      if (now - at >= TYPING_REPEAT_MS) {
        this.typed.delete(seen);
      }
    }
    await publishChange(
      this.pubsub,
      {
        event: TYPING,
        orgId,
        communityId: chat.communityId,
        chatId,
        orgUserId: actor.id,
        until: new Date(now + TYPING_FOR_MS).toISOString(),
      },
      this.logger,
    );
  }

  async watch(
    communityId: string,
    session: LiveSession,
    actor: Actor,
  ): Promise<AsyncIterable<ChatLiveEvent>> {
    if (!this.hub) {
      throw new UnavailableError('Live chat is not available');
    }
    await this.requireSettings(actor.orgId, communityId);
    await this.requireActor(actor, communityId);
    return this.hub.open({
      communityId,
      actor,
      session,
      allowed: (next) => this.access.isCommunityMember(communityId, next),
    });
  }

  async messageViews(orgId: string, messageIds: string[]): Promise<LiveMessage[]> {
    const messages = await this.repo.messagesByIds(orgId, [...new Set(messageIds)]);
    const views = await this.withSenders(orgId, null, messages);
    return views.map(({ viewerReaction: _viewerReaction, ...view }) => view);
  }

  activeParticipants(orgId: string, chatId: string): Promise<string[]> {
    return this.repo.activeParticipants(orgId, chatId);
  }

  async messageReactions(orgId: string, messageId: string): Promise<ReactionCounts> {
    const counts = await this.repo.reactionsOf(orgId, [messageId], '');
    return counts[messageId]?.reactions ?? {};
  }

  async liveChat(orgId: string, chatId: string): Promise<LiveChat | null> {
    const chat = await this.repo.findChat(orgId, chatId);
    if (!chat) {
      return null;
    }
    const participantIds = await this.repo.activeParticipants(orgId, chatId);
    const profiles = await this.participantsOf(orgId, chat.communityId, participantIds);
    return {
      chat,
      participantIds,
      participants: participantIds.flatMap((id) => profiles.get(id) ?? []),
    };
  }

  memberStates(
    orgId: string,
    communityId: string,
    orgUserIds: string[],
  ): Promise<ChatMemberStates[]> {
    return this.repo.memberStates(orgId, communityId, orgUserIds, new Date());
  }

  async messages(
    chatId: string,
    query: { page: number; pageSize: number },
    actor: Actor,
  ): Promise<Page<MessageView>> {
    const orgId = actor.orgId;
    const chat = await this.mustChat(this.repo, orgId, chatId);
    await this.requireActor(actor, chat.communityId);
    await this.requireActive(this.repo, orgId, chat.id, actor.id);
    const page = await this.repo.listMessages(orgId, chatId, query);
    this.logger.debug('chat messages read', { orgId, chatId });
    return {
      ...page,
      rows: await this.withSenders(orgId, actor, page.rows),
    };
  }

  async attachmentFile(
    chatId: string,
    messageId: string,
    assetId: string,
    actor: Actor,
  ): Promise<string> {
    const orgId = actor.orgId;
    const chat = await this.repo.findChat(orgId, chatId);
    const message = await this.repo.findMessage(orgId, messageId);
    if (!chat || !message || message.chatId !== chatId) {
      throw new NotFoundError('Message attachment', assetId);
    }
    const attached = (await this.repo.attachmentsOf(orgId, [messageId]))[messageId] ?? [];
    if (!attached.includes(assetId)) {
      throw new NotFoundError('Message attachment', assetId);
    }
    if (!(await this.access.isCommunityMember(chat.communityId, actor))) {
      throw new NotFoundError('Message attachment', assetId);
    }
    const moderates = actor.permissions.has('communities:moderate', chat.communityId);
    const users = await this.repo.participants(orgId, chatId);
    const inChat = users.some((user) => user.orgUserId === actor.id && user.leftAt === null);
    const readable = inChat
      ? message.deletedAt === null || moderates
      : moderates &&
        (await this.repo.listOpenFlags(orgId, chat.communityId)).some(
          (flag) => flag.messageId === messageId,
        );
    if (!readable) {
      throw new NotFoundError('Message attachment', assetId);
    }
    const url = await this.images.signFile(orgId, assetId);
    if (!url) {
      throw new NotFoundError('Message attachment', assetId);
    }
    return url;
  }

  async messageQueue(communityId: string, actor: Actor): Promise<MessageQueue> {
    const orgId = actor.orgId;
    this.requireModerator(actor, communityId, 'message queue');
    await this.requireActor(actor, communityId);
    await this.requireSettings(orgId, communityId);
    const flags = await this.repo.listOpenFlags(orgId, communityId, MODERATION_QUEUE_LIMIT);
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

  async titlesFor(chatIds: string[], actor: Actor): Promise<Record<string, string>> {
    const orgId = actor.orgId;
    if (chatIds.length === 0) {
      return {};
    }
    const summaries = (await this.repo.chatSummaries(orgId, [...new Set(chatIds)])).filter(
      (summary) => summary.participantIds.includes(actor.id),
    );
    const others = [
      ...new Set(
        summaries.flatMap((summary) => summary.participantIds.filter((id) => id !== actor.id)),
      ),
    ];
    const records = others.length > 0 ? await this.profiles.authorsOf(orgId, others) : {};
    const nameOf = (id: string): string => {
      const record = records[id];
      return (record && authorName(record)) || 'A member';
    };
    return Object.fromEntries(
      summaries.flatMap((summary) => {
        const names = summary.participantIds.filter((id) => id !== actor.id).map(nameOf);
        if (names.length > 0) {
          return [[summary.chat.id, names.join(', ')]];
        }
        return summary.chat.kind === 'group' ? [[summary.chat.id, 'Group chat']] : [];
      }),
    );
  }

  unreadInChat(orgId: string, chatId: string, orgUserId: string): Promise<ChatUnread> {
    return this.repo.unreadFor(orgId, chatId, orgUserId);
  }

  findMessage(orgId: string, messageId: string): Promise<Message | null> {
    return this.repo.findMessage(orgId, messageId);
  }

  async latestMessageBody(orgId: string, chatId: string): Promise<string | null> {
    const page = await this.repo.listMessages(orgId, chatId, { page: 1, pageSize: 1 });
    return page.rows[0]?.body ?? null;
  }

  isBlocked(orgId: string, communityId: string, a: string, b: string): Promise<boolean> {
    return this.repo.isBlocked(orgId, communityId, a, b);
  }

  private async setLock(
    actor: Actor,
    chatId: string,
    locked: boolean,
    communityId: string | null,
  ): Promise<Chat> {
    const orgId = actor.orgId;
    const chat = await this.mustChat(this.repo, orgId, chatId);
    if (communityId !== null && chat.communityId !== communityId) {
      throw new NotFoundError('Chat', chatId);
    }
    this.requireModerator(actor, chat.communityId, locked ? 'lock chat' : 'unlock chat');
    await this.requireActor(actor, chat.communityId);
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
    this.logger.info(locked ? 'chat locked' : 'chat unlocked', {
      orgId,
      chatId,
      actorId: actor.id,
    });
    return saved;
  }

  private requireModerator(actor: Actor, communityId: string, action: string): void {
    if (!actor.permissions.has('communities:moderate', communityId)) {
      this.logger.warn('chat moderation refused — not a moderator', {
        orgId: actor.orgId,
        communityId,
        action,
        actorId: actor.id,
      });
      throw new ForbiddenError('You need communities:moderate');
    }
  }

  private async requireSettings(orgId: string, communityId: string): Promise<DmSettings> {
    const settings = await this.content.getDmSettings(communityId, this.authors.systemActor(orgId));
    if (!settings) {
      throw new NotFoundError('Community', communityId);
    }
    return settings;
  }

  private async requireActor(actor: Actor, communityId: string): Promise<void> {
    if (!(await this.access.isCommunityMember(communityId, actor))) {
      throw new ForbiddenError('You are not a member of this community');
    }
  }

  /** Whether the person is team in the community; throws when they are not a
   *  member of it. */
  private async requirePerson(
    orgId: string,
    communityId: string,
    orgUserId: string,
  ): Promise<boolean> {
    const teams = await this.membersTeam(orgId, communityId, [orgUserId]);
    const team = teams.get(orgUserId);
    if (team === undefined) {
      throw new ForbiddenError('That person is not a member of this community');
    }
    return team;
  }

  /** Each member of the community among the given people, with whether they
   *  are team there. People who are not members are left out. */
  private async membersTeam(
    orgId: string,
    communityId: string,
    orgUserIds: string[],
  ): Promise<Map<string, boolean>> {
    const members = await this.access.communityMembersAmong(orgId, communityId, orgUserIds);
    if (members.length === 0) {
      return new Map();
    }
    const permissions = await this.authors.permissionsOfMany(orgId, members);
    return new Map(
      members.map((orgUserId) => {
        const held = permissions.get(orgUserId);
        return [orgUserId, held !== undefined && isTeam(held, communityId)];
      }),
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
      const teams = await this.membersTeam(orgId, chat.communityId, others);
      const recipients =
        chat.kind === 'group' ? others.filter((other) => teams.has(other)) : others;
      const actorTeam = isTeam(actor.permissions, chat.communityId);
      for (const other of recipients) {
        const team = teams.get(other);
        if (team === undefined || !this.mayMessage(settings, actorTeam, team)) {
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

  private mentionable(body: string, users: ChatUser[]): string[] {
    return keepAllowed(
      mentionTokens(body),
      users.filter((user) => user.leftAt === null).map((user) => user.orgUserId),
    );
  }

  private async writeMessage(
    chats: ChatRepository,
    mentions: MentionsRepository,
    orgId: string,
    actor: Actor,
    chat: Chat,
    users: ChatUser[],
    input: SendMessageInput,
  ): Promise<{ chat: Chat; message: Message; opened: boolean; mentioned: string[] }> {
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
    const mentioned = this.mentionable(input.body, users);
    await mentions.sync(orgId, 'message', message.id, mentioned, message.createdAt);
    return { chat: current, message, opened, mentioned };
  }

  private assertMayMessage(settings: DmSettings, actorTeam: boolean, targetTeam: boolean): void {
    if (!settings.enabled) {
      throw new ForbiddenError('Direct messages are off');
    }
    if (!this.mayMessage(settings, actorTeam, targetTeam)) {
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

  private mayMessage(settings: DmSettings, actorTeam: boolean, targetTeam: boolean): boolean {
    if (actorTeam) {
      return settings.teamToAnyone;
    }
    if (targetTeam) {
      return settings.memberToTeam;
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

  private async requireWritableChat(actor: Actor, chatId: string): Promise<void> {
    const chat = await this.mustChat(this.repo, actor.orgId, chatId);
    await this.requireActor(actor, chat.communityId);
    await this.requireActive(this.repo, actor.orgId, chat.id, actor.id);
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
      clientId: input.clientId ?? null,
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

  private sentEvent(
    orgId: string,
    actor: Actor,
    chat: Chat,
    message: Message,
    mentionedOrgUserIds: string[],
  ) {
    return discussionEvents.messageSent.make({
      orgId,
      data: { ...eventMessage(message), mentionedOrgUserIds },
      metadata: { ...this.meta(actor), chatStatus: chat.status },
    });
  }

  private async viewOf(actor: Actor, message: Message): Promise<MessageView> {
    const [view] = await this.withSenders(actor.orgId, actor, [message]);
    return view!;
  }

  private async withSenders(
    orgId: string,
    viewer: Actor | null,
    messages: Message[],
  ): Promise<MessageView[]> {
    if (messages.length === 0) {
      return [];
    }
    const messageIds = messages.map((message) => message.id);
    const senderIds = [...new Set(messages.map((message) => message.orgUserId))];
    const [records, permissions, attached, reactions, mentioned] = await Promise.all([
      this.profiles.authorsOf(orgId, senderIds),
      this.authors.permissionsOfMany(orgId, senderIds),
      this.repo.attachmentsOf(orgId, messageIds),
      this.repo.reactionsOf(orgId, messageIds, viewer?.id ?? ''),
      mentionViews(this.mentions, this.profiles, orgId, 'message', messageIds),
    ]);
    const hidden = (message: Message) =>
      message.deletedAt !== null &&
      !viewer?.permissions.has('communities:moderate', message.communityId);
    const shown = (message: Message) => (hidden(message) ? [] : (attached[message.id] ?? []));
    return messages.map((message) => {
      const record = records[message.orgUserId];
      if (!record) {
        throw new NotFoundError('Member', message.orgUserId);
      }
      const counts = reactions[message.id];
      return {
        ...(hidden(message) ? { ...message, body: '' } : message),
        sender: authorView(
          orgId,
          record,
          this.fileUrls,
          teamBadge(permissions.get(message.orgUserId), message.communityId),
        ),
        attachments: shown(message).map((assetId) => ({
          assetId,
          url: this.fileUrls.messageAttachment(message.chatId, message.id, assetId),
        })),
        reactions: counts?.reactions ?? {},
        viewerReaction: counts?.viewerReaction ?? null,
        mentions: hidden(message) ? [] : (mentioned[message.id] ?? []),
      };
    });
  }

  private async listItems(
    actor: Actor,
    communityId: string,
    rows: ChatInboxRow[],
  ): Promise<ChatListItem[]> {
    const orgId = actor.orgId;
    const seesDeleted = actor.permissions.has('communities:moderate', communityId);
    const now = new Date();
    const [subscribed, profiles] = await Promise.all([
      this.subscriptions.forViewer(
        orgId,
        actor.id,
        'chat',
        rows.map((item) => item.chat.id),
      ),
      this.participantsOf(
        orgId,
        communityId,
        rows.flatMap((item) => item.participantIds),
      ),
    ]);
    const subscriptionOf = new Map(subscribed.map((row) => [row.itemId, row]));
    return rows.map((item) => ({
      ...item,
      participants: item.participantIds.flatMap((id) => profiles.get(id) ?? []),
      subscription: activeSubscription(subscriptionOf.get(item.chat.id), now),
      lastMessage:
        item.lastMessage && item.lastMessage.deletedAt !== null && !seesDeleted
          ? { ...item.lastMessage, body: '' }
          : item.lastMessage,
    }));
  }

  private async participantsOf(
    orgId: string,
    communityId: string,
    orgUserIds: string[],
  ): Promise<Map<string, CommentAuthor>> {
    const ids = [...new Set(orgUserIds)];
    if (ids.length === 0) {
      return new Map();
    }
    const [records, permissions] = await Promise.all([
      this.profiles.authorsOf(orgId, ids),
      this.authors.permissionsOfMany(orgId, ids),
    ]);
    return new Map(
      ids.flatMap((id) => {
        const record = records[id];
        return record
          ? [
              [
                id,
                authorView(
                  orgId,
                  record,
                  this.fileUrls,
                  teamBadge(permissions.get(id), communityId),
                ),
              ] as const,
            ]
          : [];
      }),
    );
  }
}
