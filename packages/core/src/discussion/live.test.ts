import { describe, expect, it, vi } from 'vitest';
import type { DomainEvent, EventBus, EventDefinition, JsonValue, PubSub } from '../shared/ports.js';
import { createCapturingLogger } from '../shared/logger.js';
import type { Actor } from '../shared/actor.js';
import { actorWith } from '../organizations/index.js';
import type { Chat, ChatLiveEvent, LiveMessage } from '../types/index.js';
import type { CommentAuthor } from './model.js';
import { discussionEvents } from './events.js';
import { CHAT_CHANNEL, ChatHub, ChatLiveForwarder, type ChatChange } from './live.js';
import type { ChatLiveReads, ChatMemberStates } from './ports.js';

const ORG = 'org_1';
const COMMUNITY = 'cmy_1';
const OTHER_COMMUNITY = 'cmy_2';
const AT = new Date('2026-11-05T09:00:00.000Z');

const sarah = actorWith({ id: 'orm_sarah', orgId: ORG });
const james = actorWith({ id: 'orm_james', orgId: ORG });
const emma = actorWith({ id: 'orm_emma', orgId: ORG });
const moderator = actorWith({ id: 'orm_mod', orgId: ORG });

const SENT = discussionEvents.messageSent.type;
const UPDATED = discussionEvents.messageUpdated.type;
const DELETED = discussionEvents.messageDeleted.type;

function fakePubSub() {
  const subscribers: { handler: (message: JsonValue) => void; onReset: () => void }[] = [];
  const published: JsonValue[] = [];
  const pubsub: PubSub = {
    async publish(_channel, message) {
      published.push(message);
    },
    subscribe(channel, handler, onReset) {
      expect(channel).toBe(CHAT_CHANNEL);
      const subscriber = { handler, onReset };
      subscribers.push(subscriber);
      return () => subscribers.splice(subscribers.indexOf(subscriber), 1);
    },
    async start() {},
    async stop() {},
  };
  return {
    pubsub,
    published,
    subscribers,
    deliver(change: ChatChange) {
      for (const subscriber of [...subscribers]) {
        subscriber.handler(change as JsonValue);
      }
    },
    reset() {
      for (const subscriber of [...subscribers]) {
        subscriber.onReset();
      }
    },
  };
}

function profile(id: string): CommentAuthor {
  return {
    id,
    firstName: id,
    lastName: null,
    displayName: id,
    headline: null,
    image: null,
    imageAssetId: null,
    imageUrl: null,
    team: false,
    roleName: null,
  };
}

interface StoredMessage {
  id: string;
  chatId: string;
  orgUserId: string;
  body: string;
  deletedAt: Date | null;
}

function world() {
  const chats = new Map<string, { chat: Chat; active: Set<string> }>();
  const messages = new Map<string, StoredMessage>();
  const reactions = new Map<string, Record<string, number>>();
  const unread = new Map<string, number>();
  const counts = { participants: 0, chats: 0, messages: 0, states: 0 };
  const control: { fail: boolean; gate: Promise<void> | null } = { fail: false, gate: null };

  const chatOf = (chatId: string) => chats.get(chatId);
  const guard = async () => {
    if (control.gate) {
      await control.gate;
    }
    if (control.fail) {
      throw new Error('database down');
    }
  };

  const reads: ChatLiveReads = {
    async activeParticipants(_orgId, chatId) {
      counts.participants += 1;
      await guard();
      return [...(chatOf(chatId)?.active ?? [])].sort();
    },
    async messageViews(_orgId, ids) {
      counts.messages += 1;
      await guard();
      return ids.flatMap((id): LiveMessage[] => {
        const stored = messages.get(id);
        if (!stored) {
          return [];
        }
        const deleted = stored.deletedAt !== null;
        return [
          {
            orgId: ORG,
            id,
            communityId: chatOf(stored.chatId)!.chat.communityId,
            chatId: stored.chatId,
            orgUserId: stored.orgUserId,
            body: deleted ? '' : stored.body,
            replyToId: null,
            clientId: null,
            editedAt: null,
            deletedAt: stored.deletedAt,
            createdAt: AT,
            updatedAt: AT,
            sender: profile(stored.orgUserId),
            attachments: [],
            reactions: reactions.get(id) ?? {},
            mentions: [],
          },
        ];
      });
    },
    async messageReactions(_orgId, messageId) {
      await guard();
      return reactions.get(messageId) ?? {};
    },
    async liveChat(_orgId, chatId) {
      counts.chats += 1;
      await guard();
      const entry = chatOf(chatId);
      if (!entry) {
        return null;
      }
      const participantIds = [...entry.active].sort();
      return { chat: { ...entry.chat }, participantIds, participants: participantIds.map(profile) };
    },
    async memberStates(_orgId, communityId, orgUserIds): Promise<ChatMemberStates[]> {
      counts.states += 1;
      await guard();
      return orgUserIds.map((orgUserId) => {
        const mine = [...chats.values()].filter(
          (entry) => entry.chat.communityId === communityId && entry.active.has(orgUserId),
        );
        let total = 0;
        let requests = 0;
        const states = mine.map((entry) => {
          const count = unread.get(`${orgUserId}:${entry.chat.id}`) ?? 0;
          const request =
            entry.chat.kind === 'direct' &&
            entry.chat.status === 'pending' &&
            entry.chat.createdBy !== orgUserId;
          if (request) {
            requests += 1;
          } else {
            total += count;
          }
          return {
            chatId: entry.chat.id,
            unread: count,
            lastReadMessageId: null,
            subscription: null,
          };
        });
        return { orgUserId, unread: { unread: total + requests, requests }, chats: states };
      });
    },
  };

  return {
    reads,
    counts,
    control,
    messages,
    reactions,
    unread,
    addChat(
      id: string,
      people: string[],
      over: Partial<Chat> = {},
    ): { chat: Chat; active: Set<string> } {
      const entry = {
        chat: {
          orgId: ORG,
          id,
          communityId: COMMUNITY,
          kind: 'group' as const,
          status: 'open' as const,
          createdBy: people[0] ?? null,
          lockedAt: null,
          lockedBy: null,
          createdAt: AT,
          updatedAt: AT,
          ...over,
        },
        active: new Set(people),
      };
      chats.set(id, entry);
      return entry;
    },
    chat(id: string) {
      return chats.get(id)!;
    },
    message(id: string, chatId: string, orgUserId: string, body: string) {
      messages.set(id, { id, chatId, orgUserId, body, deletedAt: null });
    },
  };
}

type Recorded = { events: ChatLiveEvent[]; ended: () => boolean; stop: () => Promise<void> };

function read(iterable: AsyncIterable<ChatLiveEvent>): Recorded {
  const events: ChatLiveEvent[] = [];
  const iterator = iterable[Symbol.asyncIterator]();
  let ended = false;
  void (async () => {
    for (;;) {
      const result = await iterator.next();
      if (result.done) {
        ended = true;
        return;
      }
      events.push(result.value);
    }
  })();
  return {
    events,
    ended: () => ended,
    stop: async () => {
      await iterator.return?.();
    },
  };
}

async function until(check: () => boolean, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) {
      throw new Error('timed out');
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

const settle = (ms = 40) => new Promise((resolve) => setTimeout(resolve, ms));

function setup(options: { closeTimeoutMs?: number } = {}) {
  const w = world();
  const bus = fakePubSub();
  const { logger, entries } = createCapturingLogger();
  const hub = new ChatHub({
    pubsub: bus.pubsub,
    reads: w.reads,
    logger,
    flushMs: 10,
    closeTimeoutMs: options.closeTimeoutMs ?? 2000,
  });
  const open = (actor: Actor, communityId = COMMUNITY) => read(hub.open({ communityId, actor }));
  const change = (
    over: Partial<ChatChange> & Pick<ChatChange, 'event' | 'chatId'>,
  ): ChatChange => ({
    orgId: ORG,
    communityId: COMMUNITY,
    ...over,
  });
  return { w, bus, hub, open, change, entries };
}

const of = (stream: Recorded, type: ChatLiveEvent['type']) =>
  stream.events.filter((event) => event.type === type);

describe('ChatHub', () => {
  it('pushes a message to the participants’ streams only', async () => {
    const { w, bus, hub, open, change } = setup();
    await hub.start();
    w.addChat('cht_1', [sarah.id, james.id]);
    w.addChat('cht_2', [sarah.id, james.id, emma.id]);
    const s = open(sarah);
    const j = open(james);
    const e = open(emma);
    await until(() => of(s, 'unread').length === 1 && of(e, 'unread').length === 1);
    w.message('msg_9', 'cht_1', james.id, 'Hola Sarah');
    bus.deliver(change({ event: SENT, chatId: 'cht_1', messageId: 'msg_9' }));
    await until(
      () => of(s, 'message.created').length === 1 && of(j, 'message.created').length === 1,
    );
    await settle();
    expect(of(e, 'message.created')).toEqual([]);
    expect(of(s, 'message.created')[0]).toMatchObject({
      chatId: 'cht_1',
      message: { id: 'msg_9', body: 'Hola Sarah' },
    });
    expect(s.events[0]).toEqual({ type: 'ready', heartbeatMs: 25_000 });
    expect(s.events[1]).toEqual({ type: 'unread', unread: 0, requests: 0 });
    await hub.close();
  });

  it('shows a request to its recipient with her state and unread, and drops it on accept', async () => {
    const { w, bus, hub, open, change } = setup();
    await hub.start();
    const s = open(sarah);
    await until(() => of(s, 'unread').length === 1);
    w.addChat('cht_3', [james.id, sarah.id], {
      kind: 'direct',
      status: 'pending',
      createdBy: james.id,
    });
    w.unread.set(`${sarah.id}:cht_3`, 1);
    bus.deliver(
      change({
        event: discussionEvents.chatCreated.type,
        chatId: 'cht_3',
        members: [james.id, sarah.id],
      }),
    );
    await until(() => of(s, 'unread').length === 2);
    expect(of(s, 'chat.updated')).toEqual([
      expect.objectContaining({
        chatId: 'cht_3',
        chat: expect.objectContaining({ status: 'pending' }),
      }),
    ]);
    expect(of(s, 'chat.state')).toEqual([
      {
        type: 'chat.state',
        chatId: 'cht_3',
        unread: 1,
        lastReadMessageId: null,
        subscription: null,
      },
    ]);
    expect(of(s, 'unread').at(-1)).toEqual({ type: 'unread', unread: 1, requests: 1 });
    w.chat('cht_3').chat.status = 'open';
    bus.deliver(
      change({
        event: discussionEvents.chatUpdated.type,
        chatId: 'cht_3',
        members: [james.id, sarah.id],
      }),
    );
    await until(() => of(s, 'unread').length === 3);
    expect(of(s, 'unread').at(-1)).toEqual({ type: 'unread', unread: 1, requests: 0 });
    await hub.close();
  });

  it('reaches a member added while her stream was connecting', async () => {
    const { w, bus, hub, open, change } = setup();
    await hub.start();
    w.addChat('cht_2', [sarah.id, james.id]);
    w.chat('cht_2').active.add(emma.id);
    const e = open(emma);
    bus.deliver(
      change({
        event: discussionEvents.chatParticipantAdded.type,
        chatId: 'cht_2',
        orgUserId: emma.id,
        members: [emma.id, james.id],
      }),
    );
    await until(() => of(e, 'chat.updated').length === 1);
    w.message('msg_1', 'cht_2', james.id, 'Welcome Emma');
    bus.deliver(change({ event: SENT, chatId: 'cht_2', messageId: 'msg_1' }));
    await until(() => of(e, 'message.created').length === 1);
    await hub.close();
  });

  it.each([
    ['the leave first', ['leave', 'message']],
    ['the message first', ['message', 'leave']],
  ])(
    'removes a chat a member left, and keeps later messages from her, %s',
    async (_label, order) => {
      const { w, bus, hub, open, change } = setup();
      await hub.start();
      w.addChat('cht_2', [sarah.id, james.id, emma.id]);
      const e = open(emma);
      await until(() => of(e, 'unread').length === 1);
      w.chat('cht_2').active.delete(emma.id);
      w.message('msg_2', 'cht_2', james.id, 'After you left');
      for (const step of order) {
        bus.deliver(
          step === 'leave'
            ? change({
                event: discussionEvents.chatUpdated.type,
                chatId: 'cht_2',
                members: [emma.id, james.id, sarah.id],
              })
            : change({ event: SENT, chatId: 'cht_2', messageId: 'msg_2' }),
        );
      }
      await until(() => of(e, 'chat.removed').length === 1);
      await settle();
      expect(of(e, 'message.created')).toEqual([]);
      expect(of(e, 'chat.updated')).toEqual([]);
      await hub.close();
    },
  );

  it('handles 100 joins for one group arriving together with at most two reads', async () => {
    const { w, bus, hub, open, change } = setup();
    await hub.start();
    const people = Array.from({ length: 100 }, (_, index) => `orm_p${index}`);
    w.addChat('cht_9', [sarah.id, ...people]);
    const s = open(sarah);
    await until(() => of(s, 'unread').length === 1);
    for (const person of people) {
      bus.deliver(
        change({
          event: discussionEvents.chatParticipantAdded.type,
          chatId: 'cht_9',
          orgUserId: person,
          members: [person, sarah.id],
        }),
      );
    }
    await until(() => of(s, 'chat.updated').length >= 1);
    await settle();
    expect(w.counts.chats).toBeLessThanOrEqual(2);
    expect(of(s, 'chat.updated').length).toBeLessThanOrEqual(2);
    await hub.close();
  });

  it('carries the second of two quick edits in its last push', async () => {
    const { w, bus, hub, open, change } = setup();
    await hub.start();
    w.addChat('cht_1', [sarah.id, james.id]);
    w.message('msg_3', 'cht_1', james.id, 'first edit');
    const s = open(sarah);
    await until(() => of(s, 'unread').length === 1);
    bus.deliver(change({ event: UPDATED, chatId: 'cht_1', messageId: 'msg_3' }));
    w.messages.get('msg_3')!.body = 'second edit';
    bus.deliver(change({ event: UPDATED, chatId: 'cht_1', messageId: 'msg_3' }));
    await until(() => of(s, 'message.updated').length >= 1);
    await settle();
    const last = of(s, 'message.updated').at(-1);
    expect(last).toMatchObject({ message: { body: 'second edit' } });
    await hub.close();
  });

  it('removes a chat on a stale update after a leave, and shows it on a leave after a rejoin', async () => {
    const { w, bus, hub, open, change } = setup();
    await hub.start();
    w.addChat('cht_2', [sarah.id, james.id]);
    const e = open(emma);
    await until(() => of(e, 'unread').length === 1);
    bus.deliver(
      change({
        event: discussionEvents.chatUpdated.type,
        chatId: 'cht_2',
        members: [emma.id, james.id, sarah.id],
      }),
    );
    await until(() => of(e, 'chat.removed').length === 1);
    expect(of(e, 'chat.updated')).toEqual([]);
    w.chat('cht_2').active.add(emma.id);
    bus.deliver(
      change({
        event: discussionEvents.chatUpdated.type,
        chatId: 'cht_2',
        members: [emma.id, james.id, sarah.id],
      }),
    );
    await until(() => of(e, 'chat.updated').length === 1);
    expect(of(e, 'chat.removed')).toHaveLength(1);
    await hub.close();
  });

  it('gives each member’s reaction its own push', async () => {
    const { w, bus, hub, open, change } = setup();
    await hub.start();
    w.addChat('cht_1', [sarah.id, james.id]);
    w.message('msg_4', 'cht_1', james.id, 'Reacted');
    w.reactions.set('msg_4', { '👍': 1, '🎉': 1 });
    const s = open(sarah);
    await until(() => of(s, 'unread').length === 1);
    const reaction = (orgUserId: string, emoji: string) =>
      change({
        event: discussionEvents.messageReactionsChanged.type,
        chatId: 'cht_1',
        messageId: 'msg_4',
        orgUserId,
        reaction: emoji,
      });
    bus.deliver(reaction(sarah.id, '👍'));
    bus.deliver(reaction(james.id, '🎉'));
    await until(() => of(s, 'message.reactions').length === 2);
    expect(
      of(s, 'message.reactions').map((event) =>
        event.type === 'message.reactions' ? [event.orgUserId, event.reaction] : [],
      ),
    ).toEqual(
      expect.arrayContaining([
        [sarah.id, '👍'],
        [james.id, '🎉'],
      ]),
    );
    expect(of(s, 'message.reactions')[0]).toMatchObject({ reactions: { '👍': 1, '🎉': 1 } });
    await hub.close();
  });

  it('pushes a deletion without a body for a send handled after the delete', async () => {
    const { w, bus, hub, open, change } = setup();
    await hub.start();
    w.addChat('cht_1', [sarah.id, james.id]);
    w.message('msg_5', 'cht_1', james.id, 'Oops');
    w.messages.get('msg_5')!.deletedAt = AT;
    const s = open(sarah);
    await until(() => of(s, 'unread').length === 1);
    bus.deliver(change({ event: SENT, chatId: 'cht_1', messageId: 'msg_5' }));
    await until(() => of(s, 'message.deleted').length === 1);
    expect(of(s, 'message.deleted')[0]).toEqual({
      type: 'message.deleted',
      chatId: 'cht_1',
      messageId: 'msg_5',
      deletedAt: AT,
    });
    expect(JSON.stringify(s.events)).not.toContain('Oops');
    expect(of(s, 'message.created')).toEqual([]);
    await hub.close();
  });

  it('ends with the database total after two chats’ changes handled at once', async () => {
    const { w, bus, hub, open, change } = setup();
    await hub.start();
    w.addChat('cht_1', [sarah.id, james.id]);
    w.addChat('cht_2', [sarah.id, james.id, emma.id]);
    const s = open(sarah);
    await until(() => of(s, 'unread').length === 1);
    w.message('msg_6', 'cht_1', james.id, 'one');
    w.message('msg_7', 'cht_2', emma.id, 'two');
    w.unread.set(`${sarah.id}:cht_1`, 1);
    w.unread.set(`${sarah.id}:cht_2`, 1);
    bus.deliver(change({ event: SENT, chatId: 'cht_1', messageId: 'msg_6' }));
    bus.deliver(change({ event: SENT, chatId: 'cht_2', messageId: 'msg_7' }));
    await until(() => of(s, 'chat.state').length >= 2);
    await settle();
    expect(of(s, 'unread').at(-1)).toEqual({ type: 'unread', unread: 2, requests: 0 });
    await hub.close();
  });

  it('adds no row for a moderator who locks a chat he is not in', async () => {
    const { w, bus, hub, open, change } = setup();
    await hub.start();
    w.addChat('cht_2', [sarah.id, james.id], { lockedAt: AT, lockedBy: moderator.id });
    const m = open(moderator);
    const s = open(sarah);
    await until(() => of(m, 'unread').length === 1 && of(s, 'unread').length === 1);
    bus.deliver(
      change({
        event: discussionEvents.chatUpdated.type,
        chatId: 'cht_2',
        members: [james.id, moderator.id, sarah.id],
      }),
    );
    await until(() => of(s, 'chat.updated').length === 1);
    await settle();
    expect(of(m, 'chat.updated')).toEqual([]);
    expect(of(s, 'chat.updated')[0]).toMatchObject({ chat: { lockedBy: moderator.id } });
    await hub.close();
  });

  it('keeps each member’s state, reads and mutes to that member', async () => {
    const { w, bus, hub, open, change } = setup();
    await hub.start();
    w.addChat('cht_1', [sarah.id, james.id]);
    const s = open(sarah);
    const j = open(james);
    await until(() => of(s, 'unread').length === 1 && of(j, 'unread').length === 1);
    w.unread.set(`${sarah.id}:cht_1`, 0);
    bus.deliver(
      change({ event: discussionEvents.chatRead.type, chatId: 'cht_1', orgUserId: sarah.id }),
    );
    bus.deliver(
      change({ event: discussionEvents.chatMuted.type, chatId: 'cht_1', orgUserId: sarah.id }),
    );
    await until(() => of(s, 'chat.state').length === 1);
    await settle();
    expect(of(j, 'chat.state')).toEqual([]);
    expect(of(j, 'unread')).toHaveLength(1);
    await hub.close();
  });

  it('sends typing to the other participants only', async () => {
    const { w, bus, hub, open, change } = setup();
    await hub.start();
    w.addChat('cht_1', [sarah.id, james.id]);
    const s = open(sarah);
    const j = open(james);
    const until5 = new Date(AT.getTime() + 5000).toISOString();
    await until(() => of(s, 'unread').length === 1 && of(j, 'unread').length === 1);
    bus.deliver(change({ event: 'typing', chatId: 'cht_1', orgUserId: james.id, until: until5 }));
    bus.deliver(change({ event: 'typing', chatId: 'cht_1', orgUserId: james.id, until: until5 }));
    await until(() => of(s, 'typing').length === 2);
    expect(of(s, 'typing')[0]).toEqual({
      type: 'typing',
      chatId: 'cht_1',
      orgUserId: james.id,
      until: new Date(until5),
    });
    expect(of(j, 'typing')).toEqual([]);
    await hub.close();
  });

  it('ignores a change in a community with no local stream', async () => {
    const { w, bus, hub, open, change } = setup();
    await hub.start();
    w.addChat('cht_1', [sarah.id, james.id]);
    const s = open(sarah, OTHER_COMMUNITY);
    await until(() => of(s, 'unread').length === 1);
    bus.deliver(change({ event: SENT, chatId: 'cht_1', messageId: 'msg_1' }));
    await settle();
    expect(w.counts.participants).toBe(0);
    await hub.close();
  });

  it('sends resync to the community’s streams when a read fails, and on a reset', async () => {
    const { w, bus, hub, open, change, entries } = setup();
    await hub.start();
    w.addChat('cht_1', [sarah.id, james.id]);
    const s = open(sarah);
    const elsewhere = open(emma, OTHER_COMMUNITY);
    await until(() => of(s, 'unread').length === 1 && of(elsewhere, 'unread').length === 1);
    w.control.fail = true;
    bus.deliver(change({ event: SENT, chatId: 'cht_1', messageId: 'msg_1' }));
    await until(() => of(s, 'resync').length === 1);
    expect(of(elsewhere, 'resync')).toEqual([]);
    expect(entries.some((entry) => entry.msg === 'chat change read failed')).toBe(true);
    w.control.fail = false;
    await until(() => of(s, 'unread').length === 2);
    bus.reset();
    await until(() => of(s, 'resync').length === 2 && of(elsewhere, 'resync').length === 1);
    await hub.close();
  });

  it('drops every pending change and resyncs every stream past 5,000', async () => {
    const { w, bus, hub, open, change } = setup();
    await hub.start();
    const s = open(sarah);
    await until(() => of(s, 'unread').length === 1);
    let release!: () => void;
    w.control.gate = new Promise((resolve) => {
      release = resolve;
    });
    for (let index = 0; index < 16; index += 1) {
      w.addChat(`cht_busy${index}`, [sarah.id]);
      bus.deliver(change({ event: SENT, chatId: `cht_busy${index}`, messageId: 'msg_x' }));
    }
    expect(w.counts.participants).toBe(16);
    w.addChat('cht_typing', [sarah.id, james.id]);
    const typing = change({
      event: 'typing',
      chatId: 'cht_typing',
      orgUserId: james.id,
      until: AT.toISOString(),
    });
    for (let index = 0; index < 5000; index += 1) {
      bus.deliver(typing);
    }
    await settle();
    expect(of(s, 'resync')).toEqual([]);
    bus.deliver(typing);
    await until(() => of(s, 'resync').length === 1);
    w.control.gate = null;
    release();
    await settle();
    expect(w.counts.participants).toBe(16);
    await hub.close();
  });

  it('replaces a stream’s backlog with resync past 256 unread events', async () => {
    const { w, bus, hub, change } = setup();
    await hub.start();
    w.addChat('cht_1', [sarah.id, james.id]);
    const stream = hub.open({
      communityId: COMMUNITY,
      actor: sarah,
    });
    const iterator = stream[Symbol.asyncIterator]();
    const typing = change({
      event: 'typing',
      chatId: 'cht_1',
      orgUserId: james.id,
      until: AT.toISOString(),
    });
    for (let index = 0; index < 300; index += 1) {
      bus.deliver(typing);
    }
    await settle(100);
    const first = await iterator.next();
    expect(first.value).toEqual({ type: 'resync' });
    await iterator.return?.();
    await hub.close();
  });

  it('pushes no viewer reaction, no deleted body and no other member’s state', async () => {
    const { w, bus, hub, open, change } = setup();
    await hub.start();
    w.addChat('cht_1', [sarah.id, james.id]);
    w.message('msg_8', 'cht_1', james.id, 'Secret');
    const s = open(sarah);
    const j = open(james);
    await until(() => of(s, 'unread').length === 1 && of(j, 'unread').length === 1);
    bus.deliver(change({ event: SENT, chatId: 'cht_1', messageId: 'msg_8' }));
    await until(() => of(s, 'message.created').length === 1);
    w.messages.get('msg_8')!.deletedAt = AT;
    bus.deliver(change({ event: DELETED, chatId: 'cht_1', messageId: 'msg_8' }));
    await until(() => of(s, 'message.deleted').length === 1);
    await settle();
    w.unread.set(`${james.id}:cht_1`, 7);
    bus.deliver(
      change({ event: discussionEvents.chatRead.type, chatId: 'cht_1', orgUserId: james.id }),
    );
    await until(() =>
      of(j, 'chat.state').some((event) => event.type === 'chat.state' && event.unread === 7),
    );
    await settle();
    for (const event of [...s.events, ...j.events]) {
      if (event.type === 'message.created' || event.type === 'message.updated') {
        expect(event.message).not.toHaveProperty('viewerReaction');
      }
    }
    expect(JSON.stringify(of(s, 'message.deleted'))).not.toContain('Secret');
    expect(
      of(s, 'chat.state').some((event) => event.type === 'chat.state' && event.unread === 7),
    ).toBe(false);
    await hub.close();
  });
});

describe('ChatHub streams', () => {
  it('closes every stream with shutdown, and answers a late stream with it at once', async () => {
    const { hub, open } = setup();
    await hub.start();
    const s = open(sarah);
    const j = open(james);
    await until(() => of(s, 'unread').length === 1);
    await hub.close();
    for (const stream of [s, j]) {
      expect(stream.ended()).toBe(true);
      expect(stream.events.at(-1)).toEqual({ type: 'closed', reason: 'shutdown' });
    }
    const late = open(emma);
    await until(() => late.ended());
    expect(late.events).toEqual([{ type: 'closed', reason: 'shutdown' }]);
  });

  it('waits at most the close timeout for a stream nobody reads', async () => {
    const { hub } = setup({ closeTimeoutMs: 50 });
    await hub.start();
    hub.open({
      communityId: COMMUNITY,
      actor: sarah,
    });
    const started = Date.now();
    await hub.close();
    expect(Date.now() - started).toBeLessThan(500);
  });
});

describe('ChatLiveForwarder', () => {
  function localBus() {
    const handlers = new Map<string, ((event: DomainEvent) => Promise<void>)[]>();
    const bus: EventBus = {
      async publish(event) {
        for (const handler of handlers.get(event.type) ?? []) {
          await handler(event);
        }
      },
      subscribe(
        typeOrDefinition: string | EventDefinition<DomainEvent>,
        handler: (event: DomainEvent) => Promise<void>,
      ) {
        const type =
          typeof typeOrDefinition === 'string' ? typeOrDefinition : typeOrDefinition.type;
        handlers.set(type, [...(handlers.get(type) ?? []), handler]);
      },
      subscribeAll() {},
    } as EventBus;
    return bus;
  }

  const asEvent = (event: { type: string; orgId: string; data: unknown; metadata?: unknown }) =>
    ({ ...event, id: 'evt_1', version: 1, occurredAt: AT.toISOString() }) as DomainEvent;

  it('publishes each chat change without a body', async () => {
    const bus = localBus();
    const { pubsub, published } = fakePubSub();
    new ChatLiveForwarder({ pubsub }).attach(bus);
    await bus.publish(
      asEvent(
        discussionEvents.chatUpdated.make({
          orgId: ORG,
          data: {
            orgId: ORG,
            id: 'cht_2',
            communityId: COMMUNITY,
            kind: 'group',
            status: 'open',
            createdBy: sarah.id,
            lockedAt: null,
            lockedBy: null,
            createdAt: AT,
            updatedAt: AT,
            participantIds: [james.id, sarah.id],
          },
          metadata: { actorId: emma.id },
        }),
      ),
    );
    await bus.publish(
      asEvent(
        discussionEvents.messageSent.make({
          orgId: ORG,
          data: {
            orgId: ORG,
            id: 'msg_9',
            communityId: COMMUNITY,
            chatId: 'cht_1',
            orgUserId: james.id,
            body: 'Hola',
            replyToId: null,
            editedAt: null,
            deletedAt: null,
            createdAt: AT,
            updatedAt: AT,
            mentionedOrgUserIds: [],
          },
          metadata: { actorId: james.id },
        }),
      ),
    );
    await bus.publish(
      asEvent(
        discussionEvents.messageReactionsChanged.make({
          orgId: ORG,
          data: {
            messageId: 'msg_9',
            chatId: 'cht_1',
            communityId: COMMUNITY,
            orgUserId: sarah.id,
            reaction: null,
          },
        }),
      ),
    );
    await bus.publish(
      asEvent(
        discussionEvents.chatMuted.make({
          orgId: ORG,
          data: { chatId: 'cht_1', communityId: COMMUNITY, orgUserId: sarah.id, mutedUntil: null },
        }),
      ),
    );
    expect(published).toEqual([
      {
        event: 'discussion.chat.updated',
        orgId: ORG,
        communityId: COMMUNITY,
        chatId: 'cht_2',
        members: [emma.id, james.id, sarah.id].sort(),
      },
      {
        event: 'discussion.message.sent',
        orgId: ORG,
        communityId: COMMUNITY,
        chatId: 'cht_1',
        messageId: 'msg_9',
      },
      {
        event: 'discussion.message.reactions.changed',
        orgId: ORG,
        communityId: COMMUNITY,
        chatId: 'cht_1',
        messageId: 'msg_9',
        orgUserId: sarah.id,
        reaction: null,
      },
      {
        event: 'discussion.chat.muted',
        orgId: ORG,
        communityId: COMMUNITY,
        chatId: 'cht_1',
        orgUserId: sarah.id,
      },
    ]);
    expect(JSON.stringify(published)).not.toContain('Hola');
  });

  it.each([
    ['fails', () => Promise.reject(new Error('connection refused'))],
    ['never settles', () => new Promise<void>(() => {})],
  ])('keeps automations running when the publish %s', async (_label, publish) => {
    const bus = localBus();
    const { logger, entries } = createCapturingLogger();
    const pubsub: PubSub = {
      publish,
      subscribe: () => () => {},
      async start() {},
      async stop() {},
    };
    new ChatLiveForwarder({ pubsub, logger, timeoutMs: 50 }).attach(bus);
    const automations = vi.fn(async () => {});
    bus.subscribe(discussionEvents.chatRead, automations);
    const event = asEvent(
      discussionEvents.chatRead.make({
        orgId: ORG,
        data: {
          chatId: 'cht_1',
          communityId: COMMUNITY,
          orgUserId: sarah.id,
          lastReadMessageId: 'msg_1',
        },
      }),
    );
    const started = Date.now();
    await expect(bus.publish(event)).resolves.toBeUndefined();
    expect(Date.now() - started).toBeLessThan(1000);
    expect(automations).toHaveBeenCalledTimes(1);
    expect(entries.map((entry) => entry.msg)).toContain('live publish failed');
  });
});
