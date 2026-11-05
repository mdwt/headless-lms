import { z } from 'zod';
import type { DomainEvent, EventBus, JsonValue, Logger, PubSub } from '../shared/ports.js';
import { noopLogger } from '../shared/logger.js';
import type { Actor } from '../shared/actor.js';
import type { ChatLiveEvent } from '../types/index.js';
import { discussionEvents } from './events.js';
import type {
  ChatCreated,
  ChatMuted,
  ChatRead,
  ChatUpdated,
  MessageDeleted,
  MessageSent,
  MessageUpdated,
} from './events.js';
import type { ChatLiveReads, LiveSession } from './ports.js';

export const CHAT_CHANNEL = 'discussion.chats';
export const TYPING = 'typing';

const HEARTBEAT_MS = 25_000;
const PUBLISH_TIMEOUT_MS = 2000;
const FLUSH_MS = 1000;
const CHECK_MS = 30_000;
const CHECK_JITTER_MS = 5000;
const CLOSE_TIMEOUT_MS = 2000;
const MAX_CHATS = 16;
const MAX_PENDING = 5000;
const STREAM_QUEUE = 256;

const SENT = discussionEvents.messageSent.type;
const UPDATED = discussionEvents.messageUpdated.type;
const DELETED = discussionEvents.messageDeleted.type;
const REACTIONS = discussionEvents.messageReactionsChanged.type;
const CREATED = discussionEvents.chatCreated.type;
const CHAT_UPDATED = discussionEvents.chatUpdated.type;
const ADDED = discussionEvents.chatParticipantAdded.type;
const READ = discussionEvents.chatRead.type;
const MUTED = discussionEvents.chatMuted.type;

const chatChangeSchema = z.object({
  event: z.string(),
  orgId: z.string(),
  communityId: z.string(),
  chatId: z.string(),
  messageId: z.string().optional(),
  orgUserId: z.string().optional(),
  members: z.array(z.string()).optional(),
  reaction: z.string().nullable().optional(),
  until: z.string().optional(),
});

/** One chat change on the `discussion.chats` channel. It never carries a body;
 *  every instance reads current state itself. */
export type ChatChange = z.infer<typeof chatChangeSchema>;

/** Publishes a change, logging and dropping it when the publish fails or has
 *  not finished within 2 s. Never throws. */
export async function publishChange(
  pubsub: PubSub,
  change: ChatChange,
  logger: Logger,
  timeoutMs = PUBLISH_TIMEOUT_MS,
): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      pubsub.publish(CHAT_CHANNEL, change as JsonValue),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('publish timed out')), timeoutMs);
      }),
    ]);
  } catch (error) {
    logger.warn('live publish failed', {
      orgId: change.orgId,
      chatId: change.chatId,
      event: change.event,
      error: (error as Error).message,
    });
  } finally {
    clearTimeout(timer);
  }
}

function actorOf(event: DomainEvent): string[] {
  const actor = event.metadata?.actorOrgUserId;
  return typeof actor === 'string' ? [actor] : [];
}

function union(...lists: string[][]): string[] {
  return [...new Set(lists.flat())].sort();
}

export type ChatLiveForwarderParams = {
  pubsub: PubSub;
  logger?: Logger;
  timeoutMs?: number;
};

/** Publishes every chat change committed through the outbox to every instance. */
export class ChatLiveForwarder {
  private readonly pubsub: PubSub;
  private readonly logger: Logger;
  private readonly timeoutMs: number;

  constructor(params: ChatLiveForwarderParams) {
    this.pubsub = params.pubsub;
    this.logger = params.logger ?? noopLogger;
    this.timeoutMs = params.timeoutMs ?? PUBLISH_TIMEOUT_MS;
  }

  attach(bus: EventBus): void {
    const forward = (change: ChatChange) =>
      publishChange(this.pubsub, change, this.logger, this.timeoutMs);
    const chat = (event: ChatCreated | ChatUpdated) =>
      forward({
        event: event.type,
        orgId: event.orgId,
        communityId: event.data.communityId,
        chatId: event.data.id,
        members: union(event.data.participantIds, actorOf(event)),
      });
    const message = (event: MessageSent | MessageUpdated | MessageDeleted) =>
      forward({
        event: event.type,
        orgId: event.orgId,
        communityId: event.data.communityId,
        chatId: event.data.chatId,
        messageId: event.data.id,
      });
    const member = (event: ChatRead | ChatMuted) =>
      forward({
        event: event.type,
        orgId: event.orgId,
        communityId: event.data.communityId,
        chatId: event.data.chatId,
        orgUserId: event.data.orgUserId,
      });
    bus.subscribe(discussionEvents.chatCreated, chat);
    bus.subscribe(discussionEvents.chatUpdated, chat);
    bus.subscribe(discussionEvents.chatParticipantAdded, (event) =>
      forward({
        event: event.type,
        orgId: event.orgId,
        communityId: event.data.communityId,
        chatId: event.data.chatId,
        orgUserId: event.data.orgUserId,
        members: union([event.data.orgUserId], actorOf(event)),
      }),
    );
    bus.subscribe(discussionEvents.messageSent, message);
    bus.subscribe(discussionEvents.messageUpdated, message);
    bus.subscribe(discussionEvents.messageDeleted, message);
    bus.subscribe(discussionEvents.messageReactionsChanged, (event) =>
      forward({
        event: event.type,
        orgId: event.orgId,
        communityId: event.data.communityId,
        chatId: event.data.chatId,
        messageId: event.data.messageId,
        orgUserId: event.data.orgUserId,
        reaction: event.data.reaction,
      }),
    );
    bus.subscribe(discussionEvents.chatRead, member);
    bus.subscribe(discussionEvents.chatMuted, member);
  }
}

export interface ChatHubOptions {
  flushMs?: number;
  checkMs?: number;
  checkJitterMs?: number;
  closeTimeoutMs?: number;
}

export type ChatHubParams = ChatHubOptions & {
  pubsub: PubSub;
  reads: ChatLiveReads;
  logger?: Logger;
};

export interface LiveRegistration {
  communityId: string;
  actor: Actor;
  session: LiveSession;
  /** Whether the member may still read the community's chats. */
  allowed(actor: Actor): Promise<boolean>;
}

class LiveStream implements AsyncIterableIterator<ChatLiveEvent> {
  readonly done: Promise<void>;
  timer: NodeJS.Timeout | undefined;
  private queue: ChatLiveEvent[] = [];
  private waiter: ((result: IteratorResult<ChatLiveEvent>) => void) | null = null;
  private ending = false;
  private finished = false;
  private resolveDone!: () => void;

  constructor(
    readonly orgId: string,
    readonly communityId: string,
    readonly orgUserId: string,
    private readonly onEnd: (stream: LiveStream) => void,
    private readonly onOverflow: (stream: LiveStream) => void,
  ) {
    this.done = new Promise((resolve) => {
      this.resolveDone = resolve;
    });
  }

  get ended(): boolean {
    return this.ending;
  }

  push(event: ChatLiveEvent): void {
    if (this.ending) {
      return;
    }
    const waiter = this.waiter;
    if (waiter) {
      this.waiter = null;
      waiter({ value: event, done: false });
      return;
    }
    if (this.queue.length >= STREAM_QUEUE) {
      this.queue = [{ type: 'resync' }];
      this.onOverflow(this);
      return;
    }
    this.queue.push(event);
  }

  end(last?: ChatLiveEvent): void {
    if (this.ending) {
      return;
    }
    if (last) {
      this.push(last);
    }
    this.ending = true;
    this.onEnd(this);
    const waiter = this.waiter;
    if (waiter && this.queue.length === 0) {
      this.waiter = null;
      this.finish();
      waiter({ value: undefined, done: true });
    }
  }

  next(): Promise<IteratorResult<ChatLiveEvent>> {
    const event = this.queue.shift();
    if (event) {
      return Promise.resolve({ value: event, done: false });
    }
    if (this.ending) {
      this.finish();
      return Promise.resolve({ value: undefined, done: true });
    }
    return new Promise((resolve) => {
      this.waiter = resolve;
    });
  }

  return(): Promise<IteratorResult<ChatLiveEvent>> {
    this.queue = [];
    this.end();
    const waiter = this.waiter;
    if (waiter) {
      this.waiter = null;
      waiter({ value: undefined, done: true });
    }
    this.finish();
    return Promise.resolve({ value: undefined, done: true });
  }

  [Symbol.asyncIterator](): AsyncIterableIterator<ChatLiveEvent> {
    return this;
  }

  private finish(): void {
    if (this.finished) {
      return;
    }
    this.finished = true;
    this.resolveDone();
  }
}

interface ChatQueue {
  pending: ChatChange[];
  running: boolean;
  queued: boolean;
}

interface DirtyGroup {
  orgId: string;
  communityId: string;
  members: Map<string, Set<string>>;
}

function coalesceKey(change: ChatChange): string | null {
  switch (change.event) {
    case SENT:
    case UPDATED:
    case DELETED:
      return `message:${change.messageId}`;
    case REACTIONS:
      return `reaction:${change.messageId}:${change.orgUserId}`;
    case CREATED:
    case CHAT_UPDATED:
    case ADDED:
      return 'chat';
    case READ:
    case MUTED:
      return `member:${change.orgUserId}`;
    default:
      return null;
  }
}

function merge(existing: ChatChange, next: ChatChange): ChatChange {
  switch (existing.event) {
    case SENT:
    case UPDATED:
    case DELETED: {
      const events = [existing.event, next.event];
      const event = events.includes(SENT) ? SENT : events.includes(DELETED) ? DELETED : UPDATED;
      return { ...next, event };
    }
    case CREATED:
    case CHAT_UPDATED:
    case ADDED:
      return { ...existing, members: union(existing.members ?? [], next.members ?? []) };
    case REACTIONS:
      return next;
    default:
      return existing;
  }
}

const key = (orgId: string, id: string) => `${orgId}\u0000${id}`;

/** This process's open chat streams, and the live delivery of every chat
 *  change to them. */
export class ChatHub {
  private readonly pubsub: PubSub;
  private readonly reads: ChatLiveReads;
  private readonly logger: Logger;
  private readonly flushMs: number;
  private readonly checkMs: number;
  private readonly checkJitterMs: number;
  private readonly closeTimeoutMs: number;
  private readonly streams = new Set<LiveStream>();
  private readonly byMember = new Map<string, Set<LiveStream>>();
  private readonly byCommunity = new Map<string, Set<LiveStream>>();
  private readonly queues = new Map<string, ChatQueue>();
  private ready: string[] = [];
  private running = 0;
  private pending = 0;
  private dirty = new Map<string, DirtyGroup>();
  private flushing = false;
  private flushAgain = false;
  private closing = false;
  private unsubscribe: (() => void) | null = null;
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(params: ChatHubParams) {
    this.pubsub = params.pubsub;
    this.reads = params.reads;
    this.logger = params.logger ?? noopLogger;
    this.flushMs = params.flushMs ?? FLUSH_MS;
    this.checkMs = params.checkMs ?? CHECK_MS;
    this.checkJitterMs = params.checkJitterMs ?? CHECK_JITTER_MS;
    this.closeTimeoutMs = params.closeTimeoutMs ?? CLOSE_TIMEOUT_MS;
  }

  async start(): Promise<void> {
    if (this.unsubscribe || this.closing) {
      return;
    }
    this.unsubscribe = this.pubsub.subscribe(
      CHAT_CHANNEL,
      (message) => this.receive(message),
      () => this.reset(),
    );
    this.flushTimer = setInterval(() => {
      if (!this.flushing) {
        void this.flush();
      }
    }, this.flushMs);
    this.flushTimer.unref();
    this.logger.info('chat hub started');
  }

  /** Ends every stream with `closed { reason: 'shutdown' }` and waits, up to
   *  2 s in all, for each to be read to its end. */
  async close(): Promise<void> {
    if (this.closing) {
      return;
    }
    this.closing = true;
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    this.queues.clear();
    this.ready = [];
    this.pending = 0;
    const streams = [...this.streams];
    for (const stream of streams) {
      stream.end({ type: 'closed', reason: 'shutdown' });
    }
    let timer: NodeJS.Timeout | undefined;
    await Promise.race([
      Promise.all(streams.map((stream) => stream.done)),
      new Promise((resolve) => {
        timer = setTimeout(resolve, this.closeTimeoutMs);
      }),
    ]);
    clearTimeout(timer);
    this.logger.info('chat hub closed', { streams: streams.length });
  }

  /** Registers one stream. It starts with `ready`, then the member's unread. */
  open(registration: LiveRegistration): AsyncIterable<ChatLiveEvent> {
    const { actor, communityId } = registration;
    const stream = new LiveStream(
      actor.orgId,
      communityId,
      actor.id,
      (ended) => this.unregister(ended),
      (full) => this.markDirty(full.orgId, full.communityId, full.orgUserId),
    );
    if (this.closing) {
      stream.end({ type: 'closed', reason: 'shutdown' });
      return stream;
    }
    this.streams.add(stream);
    this.index(this.byMember, key(stream.orgId, stream.orgUserId), stream);
    this.index(this.byCommunity, key(stream.orgId, stream.communityId), stream);
    stream.push({ type: 'ready', heartbeatMs: HEARTBEAT_MS });
    this.markDirty(stream.orgId, stream.communityId, stream.orgUserId);
    void this.flush();
    this.scheduleCheck(stream, registration);
    this.logger.debug('chat stream opened', {
      orgId: stream.orgId,
      communityId,
      streams: this.streams.size,
    });
    return stream;
  }

  private index(map: Map<string, Set<LiveStream>>, at: string, stream: LiveStream): void {
    const set = map.get(at) ?? new Set<LiveStream>();
    set.add(stream);
    map.set(at, set);
  }

  private unindex(map: Map<string, Set<LiveStream>>, at: string, stream: LiveStream): void {
    const set = map.get(at);
    set?.delete(stream);
    if (set?.size === 0) {
      map.delete(at);
    }
  }

  private unregister(stream: LiveStream): void {
    clearTimeout(stream.timer);
    if (!this.streams.delete(stream)) {
      return;
    }
    this.unindex(this.byMember, key(stream.orgId, stream.orgUserId), stream);
    this.unindex(this.byCommunity, key(stream.orgId, stream.communityId), stream);
    this.logger.debug('chat stream closed', {
      orgId: stream.orgId,
      communityId: stream.communityId,
      streams: this.streams.size,
    });
  }

  private scheduleCheck(stream: LiveStream, registration: LiveRegistration): void {
    if (stream.ended) {
      return;
    }
    const delay = this.checkMs + Math.random() * this.checkJitterMs;
    stream.timer = setTimeout(() => void this.check(stream, registration), delay);
    stream.timer.unref();
  }

  private async check(stream: LiveStream, registration: LiveRegistration): Promise<void> {
    let state: Awaited<ReturnType<LiveSession['current']>>;
    let allowed = false;
    try {
      state = await registration.session.current();
      if (state.status === 'ok') {
        allowed =
          state.actor.orgId === stream.orgId &&
          state.actor.id === stream.orgUserId &&
          (await registration.allowed(state.actor));
      }
    } catch (error) {
      this.logger.warn('chat stream session check failed', {
        orgId: stream.orgId,
        error: (error as Error).message,
      });
      this.scheduleCheck(stream, registration);
      return;
    }
    if (stream.ended) {
      return;
    }
    if (state.status === 'signed-out') {
      this.logger.info('chat stream closed', {
        orgId: stream.orgId,
        communityId: stream.communityId,
        orgUserId: stream.orgUserId,
        reason: 'session',
      });
      stream.end({ type: 'closed', reason: 'session' });
      return;
    }
    if (state.status === 'no-member' || !allowed) {
      this.logger.info('chat stream closed', {
        orgId: stream.orgId,
        communityId: stream.communityId,
        orgUserId: stream.orgUserId,
        reason: 'access',
      });
      stream.end({ type: 'closed', reason: 'access' });
      return;
    }
    this.scheduleCheck(stream, { ...registration, actor: state.actor });
  }

  private streamsOf(orgId: string, communityId: string, orgUserId: string): LiveStream[] {
    return [...(this.byMember.get(key(orgId, orgUserId)) ?? [])].filter(
      (stream) => stream.communityId === communityId,
    );
  }

  private communityStreams(orgId: string, communityId: string): LiveStream[] {
    return [...(this.byCommunity.get(key(orgId, communityId)) ?? [])];
  }

  private receive(message: JsonValue): void {
    const parsed = chatChangeSchema.safeParse(message);
    if (!parsed.success) {
      this.logger.warn('chat change unreadable');
      return;
    }
    const change = parsed.data;
    if (this.closing || !this.byCommunity.has(key(change.orgId, change.communityId))) {
      return;
    }
    const at = key(change.orgId, change.chatId);
    const queue = this.queues.get(at) ?? { pending: [], running: false, queued: false };
    this.queues.set(at, queue);
    const coalesce = coalesceKey(change);
    const index =
      coalesce === null ? -1 : queue.pending.findIndex((other) => coalesceKey(other) === coalesce);
    if (index >= 0) {
      queue.pending[index] = merge(queue.pending[index]!, change);
    } else {
      if (this.pending >= MAX_PENDING) {
        this.overflow();
        return;
      }
      queue.pending.push(change);
      this.pending += 1;
    }
    if (!queue.running && !queue.queued) {
      queue.queued = true;
      this.ready.push(at);
    }
    this.pump();
  }

  private pump(): void {
    while (this.running < MAX_CHATS && this.ready.length > 0) {
      const at = this.ready.shift()!;
      const queue = this.queues.get(at);
      if (!queue) {
        continue;
      }
      queue.queued = false;
      const change = queue.pending.shift();
      if (!change) {
        this.queues.delete(at);
        continue;
      }
      this.pending -= 1;
      queue.running = true;
      this.running += 1;
      void this.handle(change).finally(() => {
        queue.running = false;
        this.running -= 1;
        if (this.queues.get(at) === queue) {
          if (queue.pending.length > 0) {
            queue.queued = true;
            this.ready.push(at);
          } else {
            this.queues.delete(at);
          }
        }
        this.pump();
      });
    }
  }

  private overflow(): void {
    this.logger.warn('chat hub queue full; dropping pending changes', { pending: this.pending });
    for (const [at, queue] of this.queues) {
      queue.pending = [];
      queue.queued = false;
      if (!queue.running) {
        this.queues.delete(at);
      }
    }
    this.ready = [];
    this.pending = 0;
    this.resync([...this.streams]);
  }

  private reset(): void {
    this.logger.info('chat hub reset', { streams: this.streams.size });
    this.resync([...this.streams]);
  }

  private resync(streams: LiveStream[]): void {
    for (const stream of streams) {
      stream.push({ type: 'resync' });
      this.markDirty(stream.orgId, stream.communityId, stream.orgUserId);
    }
  }

  private async handle(change: ChatChange): Promise<void> {
    try {
      switch (change.event) {
        case SENT:
        case UPDATED:
        case DELETED:
          await this.onMessage(change);
          return;
        case REACTIONS:
          await this.onReactions(change);
          return;
        case CREATED:
        case CHAT_UPDATED:
        case ADDED:
          await this.onChat(change);
          return;
        case READ:
        case MUTED:
          if (change.orgUserId) {
            this.markDirty(change.orgId, change.communityId, change.orgUserId, change.chatId);
          }
          return;
        case TYPING:
          await this.onTyping(change);
          return;
        default:
          this.logger.debug('chat change ignored', { event: change.event });
      }
    } catch (error) {
      this.logger.error('chat change read failed', {
        orgId: change.orgId,
        chatId: change.chatId,
        event: change.event,
        error: (error as Error).message,
      });
      this.resync(this.communityStreams(change.orgId, change.communityId));
    }
  }

  private async participantStreams(
    change: ChatChange,
  ): Promise<{ members: string[]; streams: LiveStream[] }> {
    const active = await this.reads.activeParticipants(change.orgId, change.chatId);
    const members: string[] = [];
    const streams: LiveStream[] = [];
    for (const orgUserId of active) {
      const local = this.streamsOf(change.orgId, change.communityId, orgUserId);
      if (local.length > 0) {
        members.push(orgUserId);
        streams.push(...local);
      }
    }
    return { members, streams };
  }

  private async onMessage(change: ChatChange): Promise<void> {
    const { members, streams } = await this.participantStreams(change);
    if (streams.length === 0 || !change.messageId) {
      return;
    }
    const [view] = await this.reads.messageViews(change.orgId, [change.messageId]);
    if (!view || view.chatId !== change.chatId) {
      return;
    }
    const event: ChatLiveEvent = view.deletedAt
      ? {
          type: 'message.deleted',
          chatId: change.chatId,
          messageId: view.id,
          deletedAt: view.deletedAt,
        }
      : {
          type: change.event === SENT ? 'message.created' : 'message.updated',
          chatId: change.chatId,
          message: view,
        };
    for (const stream of streams) {
      stream.push(event);
    }
    if (change.event !== UPDATED || view.deletedAt) {
      for (const orgUserId of members) {
        this.markDirty(change.orgId, change.communityId, orgUserId, change.chatId);
      }
    }
  }

  private async onReactions(change: ChatChange): Promise<void> {
    const { streams } = await this.participantStreams(change);
    if (streams.length === 0 || !change.messageId || !change.orgUserId) {
      return;
    }
    const reactions = await this.reads.messageReactions(change.orgId, change.messageId);
    for (const stream of streams) {
      stream.push({
        type: 'message.reactions',
        chatId: change.chatId,
        messageId: change.messageId,
        reactions,
        orgUserId: change.orgUserId,
        reaction: change.reaction ?? null,
      });
    }
  }

  private async onChat(change: ChatChange): Promise<void> {
    const live = await this.reads.liveChat(change.orgId, change.chatId);
    const active = new Set(live?.participantIds ?? []);
    if (live) {
      for (const orgUserId of active) {
        const streams = this.streamsOf(change.orgId, change.communityId, orgUserId);
        if (streams.length === 0) {
          continue;
        }
        for (const stream of streams) {
          stream.push({
            type: 'chat.updated',
            chatId: change.chatId,
            chat: live.chat,
            participants: live.participants,
          });
        }
        this.markDirty(change.orgId, change.communityId, orgUserId, change.chatId);
      }
    }
    for (const orgUserId of change.members ?? []) {
      if (active.has(orgUserId)) {
        continue;
      }
      const streams = this.streamsOf(change.orgId, change.communityId, orgUserId);
      if (streams.length === 0) {
        continue;
      }
      for (const stream of streams) {
        stream.push({ type: 'chat.removed', chatId: change.chatId });
      }
      this.markDirty(change.orgId, change.communityId, orgUserId);
    }
  }

  private async onTyping(change: ChatChange): Promise<void> {
    if (!change.orgUserId || !change.until) {
      return;
    }
    const { streams } = await this.participantStreams(change);
    const until = new Date(change.until);
    for (const stream of streams) {
      if (stream.orgUserId === change.orgUserId) {
        continue;
      }
      stream.push({
        type: 'typing',
        chatId: change.chatId,
        orgUserId: change.orgUserId,
        until,
      });
    }
  }

  private markDirty(orgId: string, communityId: string, orgUserId: string, chatId?: string): void {
    const at = key(orgId, communityId);
    const group = this.dirty.get(at) ?? { orgId, communityId, members: new Map() };
    this.dirty.set(at, group);
    const chats = group.members.get(orgUserId) ?? new Set<string>();
    group.members.set(orgUserId, chats);
    if (chatId) {
      chats.add(chatId);
    }
  }

  /** Pushes the `chat.state` of every dirty member and chat and the `unread`
   *  of every dirty member, read now. One flush runs at a time. */
  private async flush(): Promise<void> {
    if (this.flushing) {
      this.flushAgain = true;
      return;
    }
    this.flushing = true;
    try {
      do {
        this.flushAgain = false;
        const groups = [...this.dirty.values()];
        this.dirty = new Map();
        await Promise.all(groups.map((group) => this.flushGroup(group)));
      } while (this.flushAgain && this.dirty.size > 0 && !this.closing);
    } finally {
      this.flushing = false;
    }
  }

  private async flushGroup(group: DirtyGroup): Promise<void> {
    const { orgId, communityId } = group;
    const members = [...group.members.keys()].filter(
      (orgUserId) => this.streamsOf(orgId, communityId, orgUserId).length > 0,
    );
    if (members.length === 0) {
      return;
    }
    let states: Awaited<ReturnType<ChatLiveReads['memberStates']>>;
    try {
      states = await this.reads.memberStates(orgId, communityId, members);
    } catch (error) {
      this.logger.error('chat member state read failed', {
        orgId,
        communityId,
        error: (error as Error).message,
      });
      for (const orgUserId of members) {
        const chats = group.members.get(orgUserId) ?? new Set<string>();
        this.markDirty(orgId, communityId, orgUserId);
        for (const chatId of chats) {
          this.markDirty(orgId, communityId, orgUserId, chatId);
        }
      }
      return;
    }
    for (const state of states) {
      const chats = group.members.get(state.orgUserId);
      const streams = this.streamsOf(orgId, communityId, state.orgUserId);
      if (!chats || streams.length === 0) {
        continue;
      }
      const events: ChatLiveEvent[] = state.chats
        .filter((chat) => chats.has(chat.chatId))
        .map((chat) => ({
          type: 'chat.state',
          chatId: chat.chatId,
          unread: chat.unread,
          lastReadMessageId: chat.lastReadMessageId,
          subscription: chat.subscription,
        }));
      events.push({ type: 'unread', ...state.unread });
      for (const stream of streams) {
        for (const event of events) {
          stream.push(event);
        }
      }
    }
  }
}
