import { describe, expect, it, vi } from 'vitest';
import { actorWith, MEMBER_ROLE_KEY } from '../../organizations/index.js';
import type { EffectivePermissions } from '../../shared/actor.js';
import { ForbiddenError, NotFoundError } from '../../shared/errors.js';
import type { AdminReportRepository, PermissionsReader, SpaceOpenersReader } from './ports.js';
import { AdminReportServiceImpl } from './service.js';
import { createFileUrls } from '../../assets/index.js';

const PAGE = { page: 1, pageSize: 20 };

const STUDENT = {
  id: 'ou_james',
  email: 'james@example.com',
  image: null,
  firstName: 'James',
  lastName: null,
  status: 'active' as const,
  entitlementCount: 1,
  avgProgress: 0,
  joinedAt: '2026-01-01T00:00:00.000Z',
  lastActiveAt: null,
  items: [{ contentId: 'crs_1', contentType: 'course' as const }],
};

function fakeRepo(): AdminReportRepository {
  return {
    overview: vi.fn(async () => ({
      publishedCourses: 0,
      draftCourses: 0,
      activeStudents: 0,
      expiringSoon: 0,
      upcomingEvents: 3,
    })),
    enrollments: vi.fn(async () => []),
    courseAnalytics: vi.fn(async () => null),
    courseEnrollments: vi.fn(async () => null),
    courseLearners: vi.fn(async () => ({ rows: [], total: 0, ...PAGE })),
    listStudents: vi.fn(async () => ({ rows: [STUDENT], total: 1, ...PAGE })),
    getStudent: vi.fn(async () => STUDENT),
    studentAnalytics: vi.fn(async () => null),
    communityAnalytics: vi.fn(async () => null),
    communityMembers: vi.fn(async () => ({
      rows: [
        { id: 'ou_emma', email: 'e@x', image: null, firstName: 'Emma', lastName: null },
        { id: 'ou_oliver', email: 'o@x', image: null, firstName: 'Oliver', lastName: null },
      ],
      total: 2,
      ...PAGE,
    })),
    eventAttendees: vi.fn(async () => ({
      rows: [
        {
          orgUserId: 'ou_james',
          displayName: 'James',
          imageAssetId: 'ast_1',
          source: 'self' as const,
          grantedAt: new Date('2026-05-01T09:00:00Z'),
        },
        {
          orgUserId: 'ou_lucy',
          displayName: null,
          imageAssetId: null,
          source: 'bundle' as const,
          grantedAt: new Date('2026-05-02T09:00:00Z'),
        },
      ],
      total: 2,
      ...PAGE,
    })),
    eventAnalytics: vi.fn(async () => ({
      attendees: 9,
      bySource: { self: 7, manual: 1, automation: 0, bundle: 1 },
      revoked: 1,
      grantsOverTime: [{ date: '2026-05-01', count: 8 }],
    })),
  };
}

const EVENT_STARTS = new Date('2026-05-12T16:00:00Z');

const events = {
  findEvent: vi.fn(async (id: string) =>
    id === 'evn_1' ? ({ id, startsAt: EVENT_STARTS, settings: { capacity: 20 } } as never) : null,
  ),
};

const people: PermissionsReader = {
  permissionsOfMany: async (_orgId, ids) =>
    new Map<string, EffectivePermissions>(
      ids.map((id) => [
        id,
        id === 'ou_emma'
          ? actorWith({
              content: { cmy_1: ['communities:moderate'] },
              contentRoles: { cmy_1: { key: 'moderator', name: 'Community lead', team: true } },
            }).permissions
          : id === 'ou_james'
            ? actorWith({
                content: { crs_1: ['courses:write'] },
                contentRoles: { crs_1: { key: 'instructor', name: 'Tutor', team: true } },
              }).permissions
            : actorWith().permissions,
      ]),
    ),
};

const spaces: SpaceOpenersReader = {
  everySpaceOpeners: vi.fn(async () => ['ou_emma']),
};

function build() {
  const repo = fakeRepo();
  return {
    repo,
    svc: new AdminReportServiceImpl({
      repo,
      permissions: people,
      spaces,
      events,
      fileUrls: createFileUrls('https://api.test', (key) => `https://cdn.test/${key}`),
    }),
  };
}

describe('AdminReportService', () => {
  it('refuses every method a person can call to an actor who holds nothing', async () => {
    const { svc, repo } = build();
    const nobody = actorWith();
    const calls: [string, () => Promise<unknown>][] = [
      ['overview', () => svc.overview(nobody)],
      ['enrollments', () => svc.enrollments(30, nobody)],
      ['courseAnalytics', () => svc.courseAnalytics('crs_1', nobody)],
      ['courseEnrollments', () => svc.courseEnrollments('crs_1', 30, nobody)],
      ['courseLearners', () => svc.courseLearners('crs_1', PAGE, nobody)],
      ['listStudents', () => svc.listStudents(PAGE, nobody)],
      ['getStudent', () => svc.getStudent('ou_james', nobody)],
      ['studentAnalytics', () => svc.studentAnalytics('ou_james', nobody)],
      ['communityAnalytics', () => svc.communityAnalytics('cmy_1', nobody)],
      ['communityMembers', () => svc.communityMembers('cmy_1', PAGE, nobody)],
      ['eventAttendees', () => svc.eventAttendees('evn_1', PAGE, nobody)],
      ['eventAnalytics', () => svc.eventAnalytics('evn_1', nobody)],
    ];
    for (const [name, call] of calls) {
      await expect(call(), name).rejects.toThrow(ForbiddenError);
    }
    for (const read of Object.values(repo)) {
      expect(read).not.toHaveBeenCalled();
    }
  });

  it('opens course analytics with progress:read on that course only', async () => {
    const { svc } = build();
    const james = actorWith({ content: { crs_1: ['progress:read'] } });
    await expect(svc.courseAnalytics('crs_1', james)).rejects.toThrow(NotFoundError);
    await expect(svc.courseEnrollments('crs_1', 7, james)).rejects.toThrow(NotFoundError);
    await expect(svc.courseAnalytics('crs_2', james)).rejects.toThrow(ForbiddenError);
  });

  it('opens community analytics with communities:read on that community only', async () => {
    const { svc } = build();
    const host = actorWith({ content: { cmy_1: ['communities:read'] } });
    await expect(svc.communityAnalytics('cmy_1', host)).rejects.toThrow(NotFoundError);
    await expect(svc.communityAnalytics('cmy_2', host)).rejects.toThrow(ForbiddenError);
  });

  it('lists students with people:read, asking for the Member role key, with their item roles', async () => {
    const { svc, repo } = build();
    const admin = actorWith({ orgId: 'org_1', org: ['people:read'] });
    const page = await svc.listStudents(PAGE, admin);
    expect(repo.listStudents).toHaveBeenCalledWith('org_1', PAGE, MEMBER_ROLE_KEY);
    expect(page.rows[0]?.items).toEqual([
      { contentId: 'crs_1', contentType: 'course', roleKey: 'instructor', roleName: 'Tutor' },
    ]);
    await expect(svc.getStudent('ou_james', admin)).resolves.toMatchObject({ id: 'ou_james' });
  });

  it('lists a community roster with access:read, each member team or not on that community', async () => {
    const { svc } = build();
    const page = await svc.communityMembers('cmy_1', PAGE, actorWith({ org: ['access:read'] }));
    expect(page?.rows.map(({ id, team, roleName }) => ({ id, team, roleName }))).toEqual([
      { id: 'ou_emma', team: true, roleName: 'Community lead' },
      { id: 'ou_oliver', team: false, roleName: null },
    ]);
  });

  it('marks the community members who open every space', async () => {
    const { svc } = build();
    const page = await svc.communityMembers('cmy_1', PAGE, actorWith({ org: ['access:read'] }));
    expect(spaces.everySpaceOpeners).toHaveBeenCalledWith('org_1', 'cmy_1');
    expect(page.rows.map(({ id, opensEverySpace }) => ({ id, opensEverySpace }))).toEqual([
      { id: 'ou_emma', opensEverySpace: true },
      { id: 'ou_oliver', opensEverySpace: false },
    ]);
  });

  it("lists a course's learners with progress:read on that course and refuses another course", async () => {
    const { svc, repo } = build();
    const tutor = actorWith({ orgId: 'org_1', content: { crs_1: ['progress:read'] } });
    const query = { ...PAGE, search: 'ja' };
    await expect(svc.courseLearners('crs_1', query, tutor)).resolves.toMatchObject({ total: 0 });
    expect(repo.courseLearners).toHaveBeenCalledWith('org_1', 'crs_1', query);
    await expect(svc.courseLearners('crs_2', PAGE, tutor)).rejects.toThrow(ForbiddenError);
    const reader = actorWith({ orgId: 'org_1', content: { crs_1: ['courses:read'] } });
    await expect(svc.courseLearners('crs_1', PAGE, reader)).rejects.toThrow(ForbiddenError);
    expect(repo.courseLearners).toHaveBeenCalledTimes(1);
  });

  it('answers 404 for the learners of a course that does not exist', async () => {
    const { svc, repo } = build();
    vi.mocked(repo.courseLearners).mockResolvedValue(null);
    const tutor = actorWith({ content: { crs_9: ['progress:read'] } });
    await expect(svc.courseLearners('crs_9', PAGE, tutor)).rejects.toThrow(NotFoundError);
  });

  it('counts the upcoming events in the org overview', async () => {
    const { svc } = build();
    await expect(svc.overview(actorWith({ org: ['analytics:read'] }))).resolves.toMatchObject({
      upcomingEvents: 3,
    });
  });

  it("lists an event's attendees with events:read on it, with their source, date and avatar", async () => {
    const { svc, repo } = build();
    const tom = actorWith({ orgId: 'org_1', content: { evn_1: ['events:read'] } });
    const page = await svc.eventAttendees('evn_1', PAGE, tom);
    expect(repo.eventAttendees).toHaveBeenCalledWith('org_1', 'evn_1', PAGE);
    expect(page.rows).toEqual([
      {
        orgUserId: 'ou_james',
        name: 'James',
        avatarUrl: 'https://cdn.test/public/org_1/ou_james/ast_1',
        source: 'self',
        grantedAt: new Date('2026-05-01T09:00:00Z'),
      },
      {
        orgUserId: 'ou_lucy',
        name: 'A member',
        avatarUrl: null,
        source: 'bundle',
        grantedAt: new Date('2026-05-02T09:00:00Z'),
      },
    ]);
    await expect(svc.eventAttendees('evn_2', PAGE, tom)).rejects.toThrow(ForbiddenError);
  });

  it('answers 404 for the attendees and analytics of an event that does not exist', async () => {
    const { svc, repo } = build();
    const sarah = actorWith({ org: ['events:read'] });
    await expect(svc.eventAttendees('evn_9', PAGE, sarah)).rejects.toThrow(NotFoundError);
    await expect(svc.eventAnalytics('evn_9', sarah)).rejects.toThrow(NotFoundError);
    expect(repo.eventAttendees).not.toHaveBeenCalled();
    expect(repo.eventAnalytics).not.toHaveBeenCalled();
  });

  it("adds the event's capacity to its figures, counting grants before the start", async () => {
    const { svc, repo } = build();
    const sarah = actorWith({ orgId: 'org_1', org: ['events:read'] });
    await expect(svc.eventAnalytics('evn_1', sarah)).resolves.toEqual({
      attendees: 9,
      capacity: 20,
      bySource: { self: 7, manual: 1, automation: 0, bundle: 1 },
      revoked: 1,
      grantsOverTime: [{ date: '2026-05-01', count: 8 }],
    });
    expect(repo.eventAnalytics).toHaveBeenCalledWith('org_1', 'evn_1', EVENT_STARTS);
  });
});
