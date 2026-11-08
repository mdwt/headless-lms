import { describe, expect, it, vi } from 'vitest';
import { MemberReportServiceImpl } from './service.js';
import type { MemberReportRepository } from './ports.js';
import type { EventAttendeeRow } from './model.js';
import type { ContentServicePort, EventFile, EventView } from '../../content/index.js';
import { createFileUrls } from '../../assets/index.js';
import { actorWith } from '../../organizations/index.js';
import { ForbiddenError, NotFoundError } from '../../shared/errors.js';
import type { Actor } from '../../shared/actor.js';
import { eventCalendar } from './calendar.js';

const ORG = 'org_1';
const NOW = new Date('2026-05-10T12:00:00Z');
const SYSTEM = actorWith({ id: 'system', orgId: ORG, owner: true });

const sarah = actorWith({ id: 'ou_sarah', orgId: ORG, owner: true });
const tom = actorWith({
  id: 'ou_tom',
  orgId: ORG,
  content: { evn_1: ['events:read', 'events:write'] },
});
const james = actorWith({ id: 'ou_james', orgId: ORG });
const emma = actorWith({ id: 'ou_emma', orgId: ORG });
const checkout = actorWith({ id: 'ou_key', orgId: ORG, org: ['access:write'] });

const EVENT: EventView = {
  orgId: ORG,
  id: 'evn_1',
  type: 'event',
  title: 'Conversation practice',
  description: 'Practise speaking',
  thumbnailAssetId: 'ast_cover',
  thumbnailUrl: 'https://api.test/api/member/events/evn_1/thumbnail',
  status: 'published',
  startsAt: new Date('2026-05-12T16:00:00Z'),
  endsAt: new Date('2026-05-12T17:00:00Z'),
  timeZone: 'Europe/London',
  location: {
    venue: {
      name: 'The Library',
      address: {
        line1: '1 High St',
        line2: null,
        city: 'London',
        region: null,
        postalCode: 'N1 1AA',
        country: 'GB',
      },
    },
    online: { url: 'https://zoom.us/j/123', details: 'Passcode 4821' },
  },
  recording: { url: 'https://videos.test/rec', details: null },
  settings: { type: 'public', capacity: 3, notifications: true, replay: true },
  createdAt: new Date('2026-05-01T00:00:00Z'),
  updatedAt: new Date('2026-05-01T00:00:00Z'),
};

const FILE: EventFile = {
  orgId: ORG,
  id: 'eva_1',
  eventId: 'evn_1',
  assetId: 'ast_slides',
  seq: 0,
  displayName: 'Slides.pdf',
  createdAt: EVENT.createdAt,
  updatedAt: EVENT.updatedAt,
  filename: 'deck.pdf',
  contentType: 'application/pdf',
  size: 100,
  url: 'https://api.test/api/member/events/evn_1/assets/ast_slides',
};

const ATTENDEES: EventAttendeeRow[] = [
  {
    orgUserId: 'ou_james',
    displayName: 'James',
    imageAssetId: 'ast_james',
    source: 'self',
    grantedAt: new Date('2026-05-02T09:00:00Z'),
  },
  {
    orgUserId: 'ou_lucy',
    displayName: null,
    imageAssetId: null,
    source: 'bundle',
    grantedAt: new Date('2026-05-03T09:00:00Z'),
  },
];

type World = {
  event?: EventView | null;
  attending?: string[];
  direct?: string[];
  attendees?: EventAttendeeRow[];
  ids?: string[];
};

function build(world: World = {}) {
  const event = world.event === undefined ? EVENT : world.event;
  const attendees = world.attendees ?? ATTENDEES;
  const repo: MemberReportRepository = {
    directory: async () => ({ rows: [], total: 0, page: 1, pageSize: 20 }),
    spaceMemberCounts: async () => ({}),
    people: async () => [],
    eventAttendees: vi.fn(async (_o: string, _e: string, page) => ({
      rows: attendees.slice(0, page.pageSize),
      total: attendees.length,
      ...page,
    })),
    eventFaces: vi.fn(async (_o: string, ids: string[], limit: number) =>
      Object.fromEntries(
        ids.map((id) => [id, { total: attendees.length, rows: attendees.slice(0, limit) }]),
      ),
    ),
    directEventGrants: vi.fn(async (_o: string, orgUserId: string, ids: string[]) =>
      (world.direct ?? world.attending ?? ['ou_james']).includes(orgUserId) ? ids : [],
    ),
    events: vi.fn(async (_o: string, query) => ({
      rows: world.ids ?? ['evn_1'],
      total: (world.ids ?? ['evn_1']).length,
      page: query.page,
      pageSize: query.pageSize,
    })),
  };
  const content = {
    findEvent: vi.fn(async (id: string) => (event && id === event.id ? event : null)),
    findEvents: vi.fn(async (ids: string[]) => (event && ids.includes(event.id) ? [event] : [])),
    eventFilesFor: vi.fn(async (ids: string[]) =>
      Object.fromEntries(ids.map((id) => [id, id === 'evn_1' ? [FILE] : []])),
    ),
  } as unknown as ContentServicePort;
  const signFile = vi.fn(async (_orgId: string, assetId: string) => `https://signed/${assetId}`);
  const svc = new MemberReportServiceImpl({
    repo,
    content,
    progress: {} as never,
    files: { signFile },
    fileUrls: createFileUrls('https://api.test'),
    access: {
      hasAccess: async (_o: string, orgUserId: string) =>
        (world.attending ?? ['ou_james']).includes(orgUserId),
      listAccessibleContent: async (_o: string, orgUserId: string) =>
        (world.attending ?? ['ou_james']).includes(orgUserId) ? ['evn_1'] : [],
    } as never,
    people: {
      systemActor: () => SYSTEM,
      holders: async () => [],
      permissionsOfMany: async () => new Map(),
    },
    notifications: {} as never,
    titles: {} as never,
    subscriptions: {} as never,
    notificationCategories: {} as never,
    notificationSettings: {} as never,
    channels: {} as never,
    studentPortalUrl: 'https://app.test/',
    now: () => NOW,
  });
  return { svc, repo, content, signFile };
}

function ended(event: EventView = EVENT): EventView {
  return {
    ...event,
    startsAt: new Date('2026-05-01T16:00:00Z'),
    endsAt: new Date('2026-05-01T17:00:00Z'),
  };
}

describe('the member event read', () => {
  it('returns the whole event to a holder of events:read, in any status, recording included', async () => {
    for (const status of ['draft', 'published', 'canceled'] as const) {
      const { svc } = build({ event: { ...EVENT, status } });
      const read = await svc.getEvent('evn_1', tom);
      expect(read.status).toBe(status);
      expect(read.location).toEqual(EVENT.location);
      expect(read.files).toEqual([FILE]);
      expect(read.recording).toEqual(EVENT.recording);
      expect(read.viewer.canOpen).toBe(true);
    }
  });

  it('returns the event to an attendee, published or canceled, but not a draft', async () => {
    for (const status of ['published', 'canceled'] as const) {
      const { svc } = build({
        event: { ...EVENT, status, settings: { ...EVENT.settings, type: 'private' } },
      });
      const read = await svc.getEvent('evn_1', james);
      expect(read.location).toEqual(EVENT.location);
      expect(read.files).toEqual([FILE]);
      expect(read.viewer.canOpen).toBe(true);
    }
    const { svc } = build({ event: { ...EVENT, status: 'draft' } });
    await expect(svc.getEvent('evn_1', james)).rejects.toThrow(NotFoundError);
  });

  it('gives an attendee the recording only after the end, when replay is on', async () => {
    const before = build();
    expect((await before.svc.getEvent('evn_1', james)).recording).toBeNull();
    const after = build({ event: ended() });
    expect((await after.svc.getEvent('evn_1', james)).recording).toEqual(EVENT.recording);
    const noReplay = build({
      event: ended({ ...EVENT, settings: { ...EVENT.settings, replay: false } }),
    });
    expect((await noReplay.svc.getEvent('evn_1', james)).recording).toBeNull();
    expect((await noReplay.svc.getEvent('evn_1', tom)).recording).toEqual(EVENT.recording);
  });

  it('returns a published public event to any member without location, files or recording', async () => {
    const { svc, content } = build({ event: ended() });
    const read = await svc.getEvent('evn_1', emma);
    expect(read.location).toBeNull();
    expect(read.files).toEqual([]);
    expect(read.recording).toBeNull();
    expect(read.viewer.canOpen).toBe(false);
    expect(content.eventFilesFor).not.toHaveBeenCalled();
  });

  it('answers 404 to a member for a private event, a draft or a canceled event they do not attend', async () => {
    for (const event of [
      { ...EVENT, settings: { ...EVENT.settings, type: 'private' as const } },
      { ...EVENT, status: 'draft' as const },
      { ...EVENT, status: 'canceled' as const },
    ]) {
      const { svc } = build({ event });
      await expect(svc.getEvent('evn_1', emma)).rejects.toThrow(NotFoundError);
    }
    const { svc } = build({ event: null });
    await expect(svc.getEvent('evn_1', sarah)).rejects.toThrow(NotFoundError);
  });

  it('leaves out createdAt, updatedAt and the notifications setting', async () => {
    const { svc } = build();
    const read = await svc.getEvent('evn_1', james);
    expect(read).not.toHaveProperty('createdAt');
    expect(read).not.toHaveProperty('updatedAt');
    expect(read.settings).toEqual({ type: 'public', capacity: 3, replay: true });
  });

  it('counts the attendees, shows their faces and the places left', async () => {
    const { svc, repo } = build();
    const read = await svc.getEvent('evn_1', emma);
    expect(repo.eventFaces).toHaveBeenCalledWith(ORG, ['evn_1'], 10);
    expect(read.attendeeCount).toBe(2);
    expect(read.attendees).toEqual([
      {
        orgUserId: 'ou_james',
        name: 'James',
        avatarUrl: 'https://api.test/api/member/people/ou_james/image',
      },
      { orgUserId: 'ou_lucy', name: 'A member', avatarUrl: null },
    ]);
    expect(read.placesLeft).toBe(1);
    const unlimited = build({
      event: { ...EVENT, settings: { ...EVENT.settings, capacity: null } },
    });
    expect((await unlimited.svc.getEvent('evn_1', emma)).placesLeft).toBeNull();
  });
});

describe('the viewer flags', () => {
  it('lets a member register for a public event that has not started and has places', async () => {
    const { svc } = build();
    expect((await svc.getEvent('evn_1', emma)).viewer).toEqual({
      attending: false,
      canRegister: true,
      canOpen: false,
      canLeave: false,
      canManageAttendees: false,
      canAddAttendees: false,
      canEdit: false,
      canCancel: false,
      canDelete: false,
    });
  });

  it('lets an attendee leave only through a direct grant', async () => {
    const direct = await build().svc.getEvent('evn_1', james);
    expect(direct.viewer).toMatchObject({ attending: true, canLeave: true });
    const bundled = await build({ direct: [] }).svc.getEvent('evn_1', james);
    expect(bundled.viewer).toMatchObject({ attending: true, canLeave: false });
  });

  it('lets attendee managers add people only while the event is published and not over', async () => {
    expect((await build().svc.getEvent('evn_1', tom)).viewer.canAddAttendees).toBe(true);
    const over = await build({ event: ended() }).svc.getEvent('evn_1', tom);
    expect(over.viewer).toMatchObject({ canManageAttendees: true, canAddAttendees: false });
    const draft = await build({ event: { ...EVENT, status: 'draft' } }).svc.getEvent('evn_1', tom);
    expect(draft.viewer.canAddAttendees).toBe(false);
  });

  it('marks an attendee attending, who cannot register again', async () => {
    const { svc } = build();
    expect((await svc.getEvent('evn_1', james)).viewer).toMatchObject({
      attending: true,
      canRegister: false,
      canOpen: true,
    });
  });

  it('refuses registering on a full, started, private or canceled event', async () => {
    const full = build({ attendees: [...ATTENDEES, { ...ATTENDEES[0]!, orgUserId: 'ou_ben' }] });
    expect((await full.svc.getEvent('evn_1', emma)).viewer.canRegister).toBe(false);
    expect((await full.svc.getEvent('evn_1', emma)).placesLeft).toBe(0);
    const started = build({ event: { ...EVENT, startsAt: new Date('2026-05-10T11:00:00Z') } });
    expect((await started.svc.getEvent('evn_1', emma)).viewer.canRegister).toBe(false);
    const hidden = build({
      event: { ...EVENT, settings: { ...EVENT.settings, type: 'private' } },
      attending: [],
    });
    expect((await hidden.svc.getEvent('evn_1', sarah)).viewer.canRegister).toBe(false);
    const canceled = build({ event: { ...EVENT, status: 'canceled' }, attending: [] });
    expect((await canceled.svc.getEvent('evn_1', sarah)).viewer.canRegister).toBe(false);
  });

  it('gives staff the actions their permissions allow', async () => {
    const { svc } = build({ attending: [] });
    expect((await svc.getEvent('evn_1', tom)).viewer).toMatchObject({
      canManageAttendees: true,
      canEdit: true,
      canCancel: true,
      canDelete: false,
    });
    expect((await svc.getEvent('evn_1', sarah)).viewer).toMatchObject({
      canManageAttendees: true,
      canEdit: true,
      canCancel: true,
      canDelete: true,
    });
    expect((await svc.getEvent('evn_1', checkout)).viewer).toMatchObject({
      canManageAttendees: true,
      canEdit: false,
      canDelete: false,
    });
  });
});

describe('the member event list', () => {
  it('asks for the events the caller can read and returns each as the member read', async () => {
    const { svc, repo } = build({ ids: ['evn_1'] });
    const query = { page: 1, pageSize: 20, when: 'upcoming' as const, attending: true };
    const page = await svc.listEvents(query, tom);
    expect(repo.events).toHaveBeenCalledWith(
      ORG,
      query,
      { orgUserId: 'ou_tom', readAll: false, readIds: ['evn_1'] },
      NOW,
    );
    expect(page.rows.map((row) => row.id)).toEqual(['evn_1']);
    expect(page.total).toBe(1);
    await svc.listEvents({ page: 1, pageSize: 20 }, sarah);
    expect(repo.events).toHaveBeenLastCalledWith(
      ORG,
      { page: 1, pageSize: 20 },
      { orgUserId: 'ou_sarah', readAll: true, readIds: [] },
      NOW,
    );
  });

  it('redacts each listed event as the single read does', async () => {
    const { svc } = build();
    const [row] = (await svc.listEvents({ page: 1, pageSize: 20 }, emma)).rows;
    expect(row).not.toHaveProperty('description');
    expect(row).not.toHaveProperty('files');
    expect(row?.location).toBeNull();
    expect(row?.viewer.canRegister).toBe(true);
  });

  it('reads a whole page with one call per kind of data, however many events it holds', async () => {
    const ids = Array.from({ length: 50 }, (_, i) => `evn_${i + 1}`);
    const { svc, repo, content } = build({ ids });
    await svc.listEvents({ page: 1, pageSize: 50 }, tom);
    expect(content.findEvents).toHaveBeenCalledTimes(1);
    expect(content.findEvents).toHaveBeenCalledWith(ids, SYSTEM);
    expect(repo.eventFaces).toHaveBeenCalledTimes(1);
    expect(content.eventFilesFor).not.toHaveBeenCalled();
    expect(content.findEvent).not.toHaveBeenCalled();
    expect(repo.eventAttendees).not.toHaveBeenCalled();
  });
});

describe('the event calendar file', () => {
  it('gives an attendee the location and the meeting link', async () => {
    const { svc } = build();
    const ics = await svc.eventCalendar('evn_1', james);
    expect(ics).toContain('LOCATION:The Library\\, 1 High St\\, London\\, N1 1AA\\, GB\r\n');
    expect(ics).toContain('CONFERENCE;VALUE=URI:https://zoom.us/j/123\r\n');
    expect(ics).toContain('URL:https://app.test/events/evn_1\r\n');
  });

  it('leaves the location out for a member who can only see the event', async () => {
    const { svc } = build();
    const ics = await svc.eventCalendar('evn_1', emma);
    expect(ics).not.toContain('LOCATION');
    expect(ics).not.toContain('CONFERENCE');
    expect(ics).toContain('SUMMARY:Conversation practice');
  });

  it('answers 404 when the event read does', async () => {
    const { svc } = build({ event: { ...EVENT, status: 'draft' } });
    await expect(svc.eventCalendar('evn_1', emma)).rejects.toThrow(NotFoundError);
  });
});

describe('eventCalendar', () => {
  const now = new Date('2026-05-10T12:00:00Z');
  const pageUrl = 'https://app.test/events/evn_1';

  it('writes one VEVENT with the times, the title and the event page', () => {
    expect(eventCalendar(EVENT, { pageUrl, withLocation: true, now })).toBe(
      [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Headless LMS//Events//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        'BEGIN:VEVENT',
        'UID:evn_1',
        'DTSTAMP:20260510T120000Z',
        'DTSTART:20260512T160000Z',
        'DTEND:20260512T170000Z',
        'SUMMARY:Conversation practice',
        'DESCRIPTION:https://app.test/events/evn_1',
        'URL:https://app.test/events/evn_1',
        'LOCATION:The Library\\, 1 High St\\, London\\, N1 1AA\\, GB',
        'CONFERENCE;VALUE=URI:https://zoom.us/j/123',
        'END:VEVENT',
        'END:VCALENDAR',
        '',
      ].join('\r\n'),
    );
  });

  it('uses the meeting link as the location when there is no venue', () => {
    const online = { ...EVENT, location: { ...EVENT.location, venue: null } };
    const ics = eventCalendar(online, { pageUrl, withLocation: true, now });
    expect(ics).toContain('LOCATION:https://zoom.us/j/123\r\n');
    expect(ics).toContain('CONFERENCE;VALUE=URI:https://zoom.us/j/123\r\n');
  });

  it('marks a canceled event cancelled, escapes text and folds long lines', () => {
    const canceled = {
      ...EVENT,
      status: 'canceled' as const,
      title: `Q&A; part 1, ${'x'.repeat(80)}`,
    };
    const ics = eventCalendar(canceled, { pageUrl, withLocation: false, now });
    expect(ics).toContain('STATUS:CANCELLED\r\n');
    expect(ics).toContain('SUMMARY:Q&A\\; part 1\\, ');
    for (const line of ics.split('\r\n')) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
    expect(ics).toContain('\r\n x');
  });

  it('folds between characters, never inside one', () => {
    const title = `${'🎉'.repeat(25)} Café ${'漢字'.repeat(10)}`;
    const ics = eventCalendar({ ...EVENT, title }, { pageUrl, withLocation: false, now });
    for (const line of ics.split('\r\n')) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
      expect(line).not.toMatch(
        /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/,
      );
    }
    expect(ics.replace(/\r\n /g, '')).toContain(`SUMMARY:${title}\r\n`);
  });
});

describe('event files and the cover', () => {
  it('signs an attached file under its display name for an attendee or a reader', async () => {
    for (const actor of [james, tom] as Actor[]) {
      const { svc, signFile } = build();
      await expect(svc.eventFile('evn_1', 'ast_slides', actor)).resolves.toBe(
        'https://signed/ast_slides',
      );
      expect(signFile).toHaveBeenCalledWith(ORG, 'ast_slides', { saveAs: 'Slides.pdf' });
    }
  });

  it('answers 404 for a file to a member who only sees the event, or one not attached', async () => {
    const { svc, signFile } = build();
    await expect(svc.eventFile('evn_1', 'ast_slides', emma)).rejects.toThrow(NotFoundError);
    await expect(svc.eventFile('evn_1', 'ast_other', james)).rejects.toThrow(NotFoundError);
    expect(signFile).not.toHaveBeenCalled();
  });

  it('serves the cover to anyone the event read returns, and 404 otherwise', async () => {
    const { svc } = build();
    await expect(svc.thumbnailFile('event', 'evn_1', emma)).resolves.toBe(
      'https://signed/ast_cover',
    );
    const hidden = build({ event: { ...EVENT, settings: { ...EVENT.settings, type: 'private' } } });
    await expect(hidden.svc.thumbnailFile('event', 'evn_1', emma)).rejects.toThrow(NotFoundError);
    await expect(hidden.svc.thumbnailFile('event', 'evn_1', james)).resolves.toBe(
      'https://signed/ast_cover',
    );
    const bare = build({ event: { ...EVENT, thumbnailAssetId: null } });
    await expect(bare.svc.thumbnailFile('event', 'evn_1', sarah)).rejects.toThrow(NotFoundError);
  });
});

describe('the attendee list in the member app', () => {
  it('needs events:read on the event and lists the attendees with their source', async () => {
    const { svc } = build();
    const page = await svc.eventAttendees('evn_1', { page: 1, pageSize: 20 }, tom);
    expect(page.rows.map((row) => [row.orgUserId, row.source])).toEqual([
      ['ou_james', 'self'],
      ['ou_lucy', 'bundle'],
    ]);
    await expect(svc.eventAttendees('evn_1', { page: 1, pageSize: 20 }, james)).rejects.toThrow(
      ForbiddenError,
    );
  });

  it('answers 404 for an event that does not exist', async () => {
    const { svc } = build({ event: null });
    await expect(svc.eventAttendees('evn_1', { page: 1, pageSize: 20 }, sarah)).rejects.toThrow(
      NotFoundError,
    );
  });
});
