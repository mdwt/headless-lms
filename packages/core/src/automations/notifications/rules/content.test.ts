import { describe, expect, it } from 'vitest';
import { contentEvents } from '../../../content/index.js';
import type { DomainEvent } from '../../../shared/ports.js';
import { emptyCommunityMail } from '../../community-mail.js';
import type { NotificationReads } from '../../ports.js';
import { CONTENT_RULES } from './content.js';
import type { Event } from '../../../content/index.js';

const ORG = 'org_1';

function fakeReads(activity = true, event: Event | null = null): NotificationReads {
  return {
    ...emptyCommunityMail,
    threadParticipants: async () => [],
    mutedAmong: async (_o, _i, ids) => ids,
    communityMembers: async () => [],
    switchedOn: async () => [],
    courseMembers: async () => ['ou_sarah', 'ou_james', 'ou_olivia'],
    event: async (_o, id) => (event?.id === id ? event : null),
    eventAttendees: async () => ['ou_james', 'ou_emma', 'ou_tom'],
    contentLostBy: async () => [],
    activity: async () =>
      activity
        ? {
            title: 'Rolling r',
            moduleTitle: 'Sounds',
            courseId: 'crs_1',
            courseTitle: 'Spanish in 90 Days',
          }
        : null,
    emailOf: async () => null,
    contentInfo: async () => null,
    message: async () => null,
    postsPublished: async () => [],
    unreadInChat: async () => ({ count: 0, latest: null }),
    userIdsOf: async (_o, ids) => Object.fromEntries(ids.map((id) => [id, `usr_${id.slice(3)}`])),
    memberCommunityTitles: async () => [
      { id: 'cmy_1', title: 'Spring cohort' },
      { id: 'cmy_2', title: 'Summer cohort' },
    ],
  };
}

function ready(
  made: { type: string; version: number; orgId: string; data: unknown },
  metadata?: DomainEvent['metadata'],
): DomainEvent {
  return {
    id: 'evt_1',
    occurredAt: '2026-11-03T09:00:00.000Z',
    type: made.type,
    version: made.version,
    orgId: made.orgId,
    data: made.data,
    ...(metadata ? { metadata } : {}),
  };
}

describe('content.course.activity.published', () => {
  const published = ready(
    contentEvents.activityPublished.make({
      orgId: ORG,
      data: { activityId: 'act_1', moduleId: 'mod_1', courseId: 'crs_1' },
    }),
    { actorId: 'ou_olivia' },
  );

  it('tells every course holder about the new activity, in the org', async () => {
    const lists = await CONTENT_RULES['content.course.activity.published']!(published, fakeReads());
    expect(lists).toEqual([
      {
        type: 'course.activity_added',
        scope: 'org',
        actorId: 'ou_olivia',
        communityId: null,
        spaceId: null,
        subject: { type: 'activity', id: 'act_1' },
        parent: { type: 'course', id: 'crs_1' },
        display: {
          courseTitle: 'Spanish in 90 Days',
          moduleTitle: 'Sounds',
          activityTitle: 'Rolling r',
        },
        recipients: [
          { orgUserId: 'ou_sarah', userId: 'usr_sarah', reasons: ['course_member'] },
          { orgUserId: 'ou_james', userId: 'usr_james', reasons: ['course_member'] },
        ],
      },
    ]);
  });

  it('tells nobody about an activity that no longer exists', async () => {
    expect(
      await CONTENT_RULES['content.course.activity.published']!(published, fakeReads(false)),
    ).toEqual([]);
  });
});

const EVENT: Event = {
  orgId: ORG,
  id: 'evn_1',
  type: 'event',
  title: 'Conversation practice',
  description: '',
  thumbnailAssetId: null,
  status: 'published',
  startsAt: new Date('2026-11-12T17:00:00Z'),
  endsAt: new Date('2026-11-12T18:00:00Z'),
  timeZone: 'Europe/London',
  location: { venue: null, online: { url: 'https://zoom.us/j/1', details: null } },
  recording: null,
  settings: { type: 'public', capacity: 20, notifications: true, replay: true },
  createdAt: new Date('2026-11-01T00:00:00Z'),
  updatedAt: new Date('2026-11-01T00:00:00Z'),
};

const UNCHANGED = {
  previousStatus: 'published',
  previousType: 'public',
  previousStartsAt: '2026-11-12T17:00:00.000Z',
  previousEndsAt: '2026-11-12T18:00:00.000Z',
  locationChanged: false,
};

function updated(data: Event, metadata: Record<string, string | boolean>): DomainEvent {
  return ready(contentEvents.eventUpdated.make({ orgId: ORG, data }), {
    actorId: 'ou_tom',
    ...metadata,
  });
}

async function runEvent(domainEvent: DomainEvent, current: Event | null = EVENT) {
  return CONTENT_RULES[domainEvent.type]!(domainEvent, fakeReads(true, current));
}

const moved = {
  ...EVENT,
  startsAt: new Date('2026-11-12T18:00:00Z'),
  endsAt: new Date('2026-11-12T19:00:00Z'),
};

describe('content.event.updated', () => {
  it('tells every attendee but the person who moved it that the time changed', async () => {
    const lists = await runEvent(updated(moved, UNCHANGED), moved);
    expect(lists).toEqual([
      {
        type: 'event.changed',
        scope: 'org',
        actorId: 'ou_tom',
        communityId: null,
        spaceId: null,
        subject: { type: 'event', id: 'evn_1' },
        parent: null,
        display: {
          eventTitle: 'Conversation practice',
          startsAt: '2026-11-12T18:00:00.000Z',
          endsAt: '2026-11-12T19:00:00.000Z',
          timeZone: 'Europe/London',
          changed: 'time',
        },
        recipients: [
          { orgUserId: 'ou_james', userId: 'usr_james', reasons: ['event_member'] },
          { orgUserId: 'ou_emma', userId: 'usr_emma', reasons: ['event_member'] },
        ],
      },
    ]);
  });

  it('names a location change, and a change of both', async () => {
    const location = await runEvent(updated(EVENT, { ...UNCHANGED, locationChanged: true }));
    expect(location[0]?.display.changed).toBe('location');
    const both = await runEvent(updated(moved, { ...UNCHANGED, locationChanged: true }), moved);
    expect(both[0]?.display.changed).toBe('time_and_location');
  });

  it('sends nothing for a change to anything but the times or the location', async () => {
    const renamed = { ...EVENT, title: 'Renamed', description: 'New' };
    expect(await runEvent(updated(renamed, UNCHANGED), renamed)).toEqual([]);
  });

  it('sends nothing when publishing, unpublishing or moving a draft', async () => {
    expect(
      await runEvent(updated(moved, { ...UNCHANGED, previousStatus: 'draft' }), moved),
    ).toEqual([]);
    const draft = { ...moved, status: 'draft' as const };
    expect(await runEvent(updated(draft, UNCHANGED), draft)).toEqual([]);
  });

  it('sends nothing about an event that has ended', async () => {
    const past = {
      ...EVENT,
      startsAt: new Date('2026-10-01T17:00:00Z'),
      endsAt: new Date('2026-10-01T18:00:00Z'),
    };
    expect(await runEvent(updated(past, { ...UNCHANGED, locationChanged: true }), past)).toEqual(
      [],
    );
  });

  it('tells every attendee but the person who canceled it, from published or draft', async () => {
    const canceled = { ...EVENT, status: 'canceled' as const };
    const lists = await runEvent(updated(canceled, UNCHANGED), canceled);
    expect(lists.map((list) => list.type)).toEqual(['event.canceled']);
    expect(lists[0]?.display).toEqual({
      eventTitle: 'Conversation practice',
      startsAt: '2026-11-12T17:00:00.000Z',
      endsAt: '2026-11-12T18:00:00.000Z',
      timeZone: 'Europe/London',
    });
    expect(lists[0]?.recipients?.map((r) => r.orgUserId)).toEqual(['ou_james', 'ou_emma']);
    const fromDraft = await runEvent(
      updated(canceled, { ...UNCHANGED, previousStatus: 'draft' }),
      canceled,
    );
    expect(fromDraft.map((list) => list.type)).toEqual(['event.canceled']);
  });

  it('sends nothing for an event whose notifications are off, or that no longer exists', async () => {
    const quiet = { ...moved, settings: { ...moved.settings, notifications: false } };
    expect(await runEvent(updated(moved, UNCHANGED), quiet)).toEqual([]);
    const canceled = { ...quiet, status: 'canceled' as const };
    expect(await runEvent(updated(canceled, UNCHANGED), canceled)).toEqual([]);
    expect(await runEvent(updated(moved, UNCHANGED), null)).toEqual([]);
  });
});

describe('content.event.starting_soon', () => {
  const soon = (lead: '1d' | '1h') =>
    ready(
      contentEvents.eventStartingSoon.make({
        orgId: ORG,
        data: { eventId: 'evn_1', lead, startsAt: EVENT.startsAt },
      }),
    );

  it('tells every attendee how soon it starts', async () => {
    const lists = await runEvent(soon('1h'));
    expect(lists).toEqual([
      expect.objectContaining({
        type: 'event.starting_soon',
        actorId: null,
        subject: { type: 'event', id: 'evn_1' },
        display: {
          eventTitle: 'Conversation practice',
          startsAt: '2026-11-12T17:00:00.000Z',
          endsAt: '2026-11-12T18:00:00.000Z',
          timeZone: 'Europe/London',
          leadText: '1 hour',
        },
      }),
    ]);
    expect(lists[0]?.recipients?.map((r) => r.orgUserId)).toEqual([
      'ou_james',
      'ou_emma',
      'ou_tom',
    ]);
    expect((await runEvent(soon('1d')))[0]?.display.leadText).toBe('1 day');
  });

  it('sends nothing for an event no longer published or whose notifications are off', async () => {
    expect(await runEvent(soon('1h'), { ...EVENT, status: 'canceled' })).toEqual([]);
    expect(await runEvent(soon('1h'), { ...EVENT, status: 'draft' })).toEqual([]);
    expect(
      await runEvent(soon('1h'), {
        ...EVENT,
        settings: { ...EVENT.settings, notifications: false },
      }),
    ).toEqual([]);
  });
});
