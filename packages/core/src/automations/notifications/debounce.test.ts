import { describe, expect, it, vi } from 'vitest';
import type { JsonValue } from '../../shared/ports.js';
import type { RecipientList } from '../../types/index.js';
import { emptyCommunityMail } from '../community-mail.js';
import type { NewNotification, NotificationReads } from '../ports.js';
import { FLUSH_JOB, notificationJobs, SchedulerChatDebounce } from './debounce.js';
import { NotificationProcessor } from './processor.js';
import { NOTIFICATION_TYPES } from './types.js';

const ORG = 'org_1';
const NOW = new Date('2026-11-03T09:00:00Z');
const NAMES: Record<string, string> = { ou_james: 'James', ou_sarah: 'Sarah', ou_emma: 'Emma' };

function fakeScheduler() {
  const pending = new Map<string, { runAt: Date; payload: JsonValue }>();
  return {
    pending,
    at: vi.fn(async (job: string, runAt: Date, key: string, payload: JsonValue) => {
      pending.set(`${job}|${key}`, { runAt, payload });
    }),
    cancel: vi.fn(async (job: string, key: string) => {
      pending.delete(`${job}|${key}`);
    }),
  };
}

function fakeReads(
  unread: Awaited<ReturnType<NotificationReads['unreadInChat']>>,
  over: { leftAt?: Date; muted?: boolean; blocked?: boolean; member?: boolean } = {},
) {
  const reads: NotificationReads = {
    ...emptyCommunityMail,
    communityMembersAmong: async (_o, _c, ids) => (over.member === false ? [] : ids),
    pairBlocked: async () => over.blocked ?? false,
    threadParticipants: async () => [],
    mutedAmong: vi.fn(async (_o, _item, ids) => (over.muted ? ids : [])),
    communityMembers: async () => [],
    switchedOn: async () => [],
    courseHolders: async () => [],
    activity: async () => null,
    emailOf: async () => null,
    contentInfo: async () => null,
    message: async () => null,
    postsPublished: async () => [],
    userIdsOf: async (_o, ids) => Object.fromEntries(ids.map((id) => [id, `usr_${id.slice(3)}`])),
    displayName: async (_o, id) => NAMES[id] ?? 'A member',
    chat: async () => ({
      communityId: 'cmy_1',
      kind: 'direct',
      status: 'open',
      createdBy: 'ou_emma',
      participants: [
        { orgUserId: 'ou_emma', muted: false, mutedUntil: null, leftAt: null },
        { orgUserId: 'ou_sarah', muted: false, mutedUntil: null, leftAt: over.leftAt ?? null },
      ],
    }),
    unreadInChat: vi.fn(async () => unread),
  };
  return reads;
}

function sentList(): RecipientList {
  return {
    type: 'message.sent',
    scope: 'chat',
    actorOrgUserId: 'ou_emma',
    communityId: 'cmy_1',
    spaceId: null,
    subject: { type: 'message', id: 'msg_1' },
    parent: { type: 'chat', id: 'cht_1' },
    display: {
      senderName: 'Emma',
      chatTitle: 'Emma',
      excerpt: 'Hola',
      count: '1',
      summary: '1 new message',
    },
    recipients: [
      { orgUserId: 'ou_sarah', userId: 'usr_sarah', reasons: ['participant'] },
      { orgUserId: 'ou_james', userId: 'usr_james', reasons: ['participant'] },
    ],
  };
}

function processorWith(
  reads: NotificationReads,
  scheduler: ReturnType<typeof fakeScheduler>,
  rules: Record<string, () => Promise<RecipientList[]>> = {},
) {
  const notifications: NewNotification[] = [];
  const keyOf = (row: NewNotification) => `${row.sourceEventId}:${row.userId}`;
  const processor = new NotificationProcessor({
    rules,
    reads,
    types: { get: (type) => NOTIFICATION_TYPES.find((declared) => declared.type === type) },
    channels: { list: () => ['inApp'], get: () => undefined },
    categories: {
      listFor: async () => [
        {
          key: 'mentions',
          covers: [{ type: 'mention', reasons: ['mentioned'] }],
          channels: { inApp: { default: true, locked: false } },
        },
        {
          key: 'messages',
          covers: [{ type: 'message.sent', reasons: ['participant'] }],
          channels: { inApp: { default: true, locked: false } },
        },
      ],
    },
    settings: { getMany: async () => ({}) },
    devices: { activeDevices: async () => [] },
    repo: {
      insert: vi.fn(async (_o: string, rows: NewNotification[]) => {
        for (const row of rows) {
          if (!notifications.some((stored) => keyOf(stored) === keyOf(row))) {
            notifications.push(row);
          }
        }
      }),
      pendingDeliveriesForEvent: async () => [],
    },
    engine: { deliver: async () => {} },
    debounce: new SchedulerChatDebounce(scheduler),
    now: () => NOW,
  });
  return { processor, notifications };
}

describe('SchedulerChatDebounce', () => {
  it('arms one flush per recipient two minutes after the message', async () => {
    const scheduler = fakeScheduler();
    await new SchedulerChatDebounce(scheduler).arm(ORG, sentList(), NOW);
    expect(scheduler.at).toHaveBeenCalledWith(
      FLUSH_JOB,
      new Date('2026-11-03T09:02:00Z'),
      'usr_sarah:cht_1',
      { orgId: ORG, userId: 'usr_sarah', orgUserId: 'ou_sarah', chatId: 'cht_1' },
    );
    expect([...scheduler.pending.keys()]).toEqual([
      `${FLUSH_JOB}|usr_sarah:cht_1`,
      `${FLUSH_JOB}|usr_james:cht_1`,
    ]);
  });

  it('moves the timer when a later message arms it again', async () => {
    const scheduler = fakeScheduler();
    const debounce = new SchedulerChatDebounce(scheduler);
    await debounce.arm(ORG, sentList(), NOW);
    await debounce.arm(ORG, sentList(), new Date('2026-11-03T09:01:30Z'));
    expect(scheduler.pending.get(`${FLUSH_JOB}|usr_sarah:cht_1`)?.runAt).toEqual(
      new Date('2026-11-03T09:03:30Z'),
    );
    expect(scheduler.pending.size).toBe(2);
  });

  it('cancels the flush of a person mentioned in the chat', async () => {
    const scheduler = fakeScheduler();
    const debounce = new SchedulerChatDebounce(scheduler);
    await debounce.arm(ORG, sentList(), NOW);
    await debounce.mentioned(ORG, 'usr_sarah', 'cht_1');
    expect(scheduler.cancel).toHaveBeenCalledWith(FLUSH_JOB, 'usr_sarah:cht_1');
    expect([...scheduler.pending.keys()]).toEqual([`${FLUSH_JOB}|usr_james:cht_1`]);
  });

  it('files a mention at once and cancels the flush the same message armed', async () => {
    const scheduler = fakeScheduler();
    const mention: RecipientList = {
      ...sentList(),
      type: 'mention',
      display: { authorName: 'Emma', excerpt: 'Hola Sarah', chatTitle: 'Emma' },
      recipients: [{ orgUserId: 'ou_sarah', userId: 'usr_sarah', reasons: ['mentioned'] }],
    };
    const { processor, notifications } = processorWith(
      fakeReads({ count: 0, latest: null }),
      scheduler,
      {
        'discussion.message.sent': async () => [sentList(), mention],
      },
    );
    await processor.process({
      type: 'discussion.message.sent',
      version: 1,
      id: 'evt_1',
      orgId: ORG,
      occurredAt: NOW.toISOString(),
      data: {},
    });
    expect(notifications.map((row) => [row.userId, row.type])).toEqual([['usr_sarah', 'mention']]);
    expect([...scheduler.pending.keys()]).toEqual([`${FLUSH_JOB}|usr_james:cht_1`]);
  });
});

describe('the automations.notifications.flush job', () => {
  const payload = { orgId: ORG, userId: 'usr_sarah', orgUserId: 'ou_sarah', chatId: 'cht_1' };
  const fire = { id: 'run_1', startedAt: new Date('2026-11-03T09:02:00Z') };

  it('stops when the person has read the chat', async () => {
    const reads = fakeReads({ count: 0, latest: null });
    const file = vi.fn(async () => {});
    const [job] = notificationJobs({ processor: { file }, reads });
    await job!.run(payload, fire);
    expect(reads.unreadInChat).toHaveBeenCalledWith(ORG, 'cht_1', 'ou_sarah');
    expect(file).not.toHaveBeenCalled();
  });

  it('files one message.sent list for the unread messages, keyed by the latest message', async () => {
    const reads = fakeReads({
      count: 3,
      latest: { messageId: 'msg_9', senderOrgUserId: 'ou_emma', body: 'Ready, <@ou_sarah>?' },
    });
    const file = vi.fn(async () => {});
    const [job] = notificationJobs({ processor: { file }, reads });
    await job!.run(payload, fire);
    expect(file).toHaveBeenCalledWith(
      ORG,
      'chat-flush:cht_1:msg_9',
      [
        {
          type: 'message.sent',
          scope: 'chat',
          actorOrgUserId: 'ou_emma',
          communityId: 'cmy_1',
          spaceId: null,
          subject: { type: 'message', id: 'msg_9' },
          parent: { type: 'chat', id: 'cht_1' },
          display: {
            senderName: 'Emma',
            chatTitle: 'Emma',
            excerpt: 'Ready, Sarah?',
            count: '3',
            summary: '3 new messages',
          },
          recipients: [{ orgUserId: 'ou_sarah', userId: 'usr_sarah', reasons: ['participant'] }],
        },
      ],
      { occurredAt: fire.startedAt, debounce: false },
    );
  });

  it.each([
    ['has left the chat', { leftAt: new Date('2026-11-03T09:01:00Z') }],
    ['muted the chat', { muted: true }],
    ['is in a blocked pair with the latest sender', { blocked: true }],
    ['can no longer open the community', { member: false }],
  ])('stores nothing when the person %s', async (_case, over) => {
    const reads = fakeReads(
      { count: 2, latest: { messageId: 'msg_9', senderOrgUserId: 'ou_emma', body: 'Ready?' } },
      over,
    );
    const file = vi.fn(async () => {});
    const [job] = notificationJobs({ processor: { file }, reads });
    await job!.run(payload, fire);
    expect(file).not.toHaveBeenCalled();
  });

  it('reads the mute at the time the flush runs', async () => {
    const reads = fakeReads({
      count: 1,
      latest: { messageId: 'msg_9', senderOrgUserId: 'ou_emma', body: 'Ready?' },
    });
    const [job] = notificationJobs({ processor: { file: vi.fn(async () => {}) }, reads });
    await job!.run(payload, fire);
    expect(reads.mutedAmong).toHaveBeenCalledWith(
      ORG,
      { type: 'chat', id: 'cht_1' },
      ['ou_sarah'],
      fire.startedAt,
    );
  });

  it('stores the flush notification once when the job runs twice', async () => {
    const scheduler = fakeScheduler();
    const reads = fakeReads({
      count: 1,
      latest: { messageId: 'msg_9', senderOrgUserId: 'ou_emma', body: 'Ready?' },
    });
    const { processor, notifications } = processorWith(reads, scheduler);
    const [job] = notificationJobs({ processor, reads });
    await job!.run(payload, fire);
    await job!.run(payload, fire);
    expect(notifications).toEqual([
      expect.objectContaining({
        userId: 'usr_sarah',
        type: 'message.sent',
        category: 'messages',
        sourceEventId: 'chat-flush:cht_1:msg_9',
        display: expect.objectContaining({ summary: '1 new message', count: '1' }),
      }),
    ]);
    expect(scheduler.at).not.toHaveBeenCalled();
  });

  it('refuses a payload that is not a flush', async () => {
    const file = vi.fn(async () => {});
    const [job] = notificationJobs({
      processor: { file },
      reads: fakeReads({ count: 1, latest: null }),
    });
    await job!.run({ orgId: ORG }, fire);
    expect(file).not.toHaveBeenCalled();
  });
});
