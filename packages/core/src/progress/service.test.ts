import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { ProgressServiceImpl } from './service.js';
import type { ProgressRepository, ProgressUnitOfWork } from './ports.js';
import type { ProgressRecord } from './model.js';
import type { NewProgressEvent } from './events.js';
import type { Activity, CourseManagementService, Module } from '../content/index.js';
import type { ProgressReportItem } from './types.js';
import { NotFoundError } from '../shared/errors.js';
import { actorWith } from '../organizations/index.js';
import type { Actor } from '../shared/actor.js';

const learner: Actor = actorWith({ id: 's1', orgId: 'org-1' });
const SYSTEM: Actor = actorWith({ id: 'system', orgId: 'org-1', owner: true });

function fakeRepo() {
  const records: ProgressRecord[] = [];
  const repo: ProgressRepository = {
    async insert(_orgId, record) {
      records.push(record);
      return record;
    },
    async findByTarget(orgId, target) {
      return (
        records.find(
          (r) =>
            r.orgId === orgId &&
            r.orgUserId === target.orgUserId &&
            r.targetType === target.targetType &&
            r.targetId === target.targetId,
        ) ?? null
      );
    },
    async findByTargets(orgId, orgUserId, targetIds) {
      return records.filter(
        (r) => r.orgId === orgId && r.orgUserId === orgUserId && targetIds.includes(r.targetId),
      );
    },
    async update(orgId, id, patch) {
      const record = records.find((r) => r.orgId === orgId && r.id === id);
      if (!record) {
        return null;
      }
      Object.assign(record, patch);
      return record;
    },
  };
  return { repo, records };
}

function fakeUow(repo: ProgressRepository) {
  const appended: NewProgressEvent[] = [];
  const uow: ProgressUnitOfWork = {
    run: (fn) =>
      fn({
        progress: repo,
        outbox: {
          append: async (events) => {
            appended.push(...(events as unknown as NewProgressEvent[]));
          },
        },
      }),
  };
  return { uow, appended };
}

const AT = new Date('2026-01-01T00:00:00Z');

function module(id: string, seq: number, title: string): Module {
  return { orgId: 'org-1', id, courseId: 'c1', title, seq, createdAt: AT, updatedAt: AT };
}

function activity(id: string, moduleId: string, seq: number, settings: unknown = {}): Activity {
  return {
    orgId: 'org-1',
    id,
    moduleId,
    courseId: 'c1',
    seq,
    settings: settings as Activity['settings'],
    createdAt: AT,
    updatedAt: AT,
  };
}

/** One course, two modules: m1 = [a1 (manual), a2 (manual)], m2 = [a3 (manual)]. */
function structure(overrides?: { a1Settings?: unknown }): {
  modules: Module[];
  activities: Activity[];
} {
  return {
    modules: [module('m1', 0, 'Module 1'), module('m2', 1, 'Module 2')],
    activities: [
      activity('a1', 'm1', 0, overrides?.a1Settings ?? {}),
      activity('a2', 'm1', 1),
      activity('a3', 'm2', 0),
    ],
  };
}

function fakeContent(
  modules: Module[],
  activities: Activity[],
  courseStatus: 'published' | 'draft' = 'published',
): CourseManagementService {
  return {
    getCourse: vi.fn(async (id: string, actor: Actor) => {
      expect(actor).toBe(SYSTEM);
      return id === 'c1' ? { id, status: courseStatus } : null;
    }),
    listCourseModules: vi.fn(async (_id: string, actor: Actor) => {
      expect(actor).toBe(SYSTEM);
      return modules;
    }),
    listCourseActivities: vi.fn(async (_id: string, actor: Actor) => {
      expect(actor).toBe(SYSTEM);
      return activities;
    }),
    getActivity: vi.fn(async (id: string, actor: Actor) => {
      expect(actor).toBe(SYSTEM);
      return activities.find((a) => a.id === id) ?? null;
    }),
  } as unknown as CourseManagementService;
}

function makeService(
  structure: { modules: Module[]; activities: Activity[] },
  opts: { hasAccess?: boolean; courseStatus?: 'published' | 'draft' } = {},
) {
  const { repo, records } = fakeRepo();
  const { uow, appended } = fakeUow(repo);
  const svc = new ProgressServiceImpl({
    repo,
    content: fakeContent(structure.modules, structure.activities, opts.courseStatus),
    access: { hasAccess: async () => opts.hasAccess ?? true },
    system: { systemActor: () => SYSTEM },
    uow,
  });
  return { svc, records, appended };
}

const input = (activityId: string, reports: ProgressReportItem[]) => ({
  activityId,
  reports,
});

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-23T10:00:00Z'));
});
afterAll(() => {
  vi.useRealTimers();
});

describe('ProgressService.report', () => {
  it('bare report creates the record and emits progress.started once', async () => {
    const { svc, records, appended } = makeService(structure());
    const first = await svc.report(input('a1', []), learner);
    const second = await svc.report(input('a1', []), learner);
    expect(first.id).toBe(second.id);
    expect(records).toHaveLength(1);
    expect(records[0]?.startedAt).toEqual(new Date('2026-07-23T10:00:00.000Z'));
    expect(appended).toHaveLength(1);
    expect(appended[0]).toMatchObject({ type: 'progress.record.started', orgId: 'org-1' });
    expect(appended[0]).not.toHaveProperty('courseId');
  });

  it('payload items store per-subject state without completing', async () => {
    const { svc, appended } = makeService(structure());
    const record = await svc.report(
      input('a1', [
        { asset: 'ast_v1', seconds: 612 },
        { asset: 'ast_q1', answers: { q1: 'b' }, score: 0.8 },
        { page: 3 },
      ]),
      learner,
    );
    expect(record.position).toEqual({
      ast_v1: { seconds: 612 },
      ast_q1: { answers: { q1: 'b' }, score: 0.8 },
      self: { page: 3 },
    });
    expect(record.completedAt).toBeNull();
    expect(appended.filter((e) => e.type === 'progress.record.completed')).toHaveLength(0);
  });

  it('a later report replaces its subject and preserves the others', async () => {
    const { svc } = makeService(structure());
    await svc.report(input('a1', [{ asset: 'ast_v1', seconds: 10 }]), learner);
    const record = await svc.report(input('a1', [{ asset: 'ast_v2', seconds: 99 }]), learner);
    expect(record.position).toEqual({ ast_v1: { seconds: 10 }, ast_v2: { seconds: 99 } });
  });

  it('a batch can carry state and the claim together', async () => {
    const { svc } = makeService(structure());
    const record = await svc.report(
      input('a1', [{ asset: 'ast_v1', seconds: 612 }, { completed: true }]),
      learner,
    );
    expect(record.completedAt).toEqual(new Date('2026-07-23T10:00:00.000Z'));
    expect(record.position).toEqual({ ast_v1: { seconds: 612 } });
  });

  it('completed claim on a rule-less activity completes it and emits progress.completed', async () => {
    const { svc, appended } = makeService(structure());
    const record = await svc.report(input('a1', [{ completed: true }]), learner);
    expect(record.completedAt).toEqual(new Date('2026-07-23T10:00:00.000Z'));
    const completed = appended.filter((e) => e.type === 'progress.record.completed');
    expect(completed).toHaveLength(1);
    expect(completed[0]?.data.targetId).toBe('a1');
  });

  it('completed claim with an unmet rule records nothing', async () => {
    const { svc, appended } = makeService(
      structure({ a1Settings: { completion: { rule: 'watch-percent', percent: 80 } } }),
    );
    const record = await svc.report(input('a1', [{ completed: true }]), learner);
    expect(record.completedAt).toBeNull();
    expect(appended.filter((e) => e.type === 'progress.record.completed')).toHaveLength(0);
  });

  it('re-claiming a completed activity changes nothing and emits nothing', async () => {
    const { svc, appended } = makeService(structure());
    await svc.report(input('a1', [{ completed: true }]), learner);
    const before = appended.length;
    await svc.report(input('a1', [{ completed: true }]), learner);
    expect(appended).toHaveLength(before);
  });

  it('state reported after completion still merges; completion stays untouched', async () => {
    const { svc, appended } = makeService(structure());
    await svc.report(
      input('a1', [{ asset: 'ast_v1', seconds: 10, furthest: 0, watched: 0 }, { completed: true }]),
      learner,
    );
    const before = appended.length;
    const record = await svc.report(
      input('a1', [{ asset: 'ast_v1', seconds: 198.7, furthest: 198.7, watched: 10.9 }]),
      learner,
    );
    expect(record.position).toEqual({
      ast_v1: { seconds: 198.7, furthest: 198.7, watched: 10.9 },
    });
    expect(record.completedAt).toEqual(new Date('2026-07-23T10:00:00.000Z'));
    expect(appended).toHaveLength(before);
  });

  it('last activity of a module completes the module; last module completes the course', async () => {
    const { svc, records, appended } = makeService(structure());
    await svc.report(input('a1', [{ completed: true }]), learner);
    await svc.report(input('a2', [{ completed: true }]), learner);
    // m1 done, course not (a3 open)
    expect(
      records.find((r) => r.targetType === 'module' && r.targetId === 'm1')?.completedAt,
    ).toEqual(new Date('2026-07-23T10:00:00.000Z'));
    expect(records.find((r) => r.targetType === 'course')).toBeUndefined();
    await svc.report(input('a3', [{ completed: true }]), learner);
    expect(
      records.find((r) => r.targetType === 'module' && r.targetId === 'm2')?.completedAt,
    ).toBeTruthy();
    expect(
      records.find((r) => r.targetType === 'course' && r.targetId === 'c1')?.completedAt,
    ).toBeTruthy();
    const completedTargets = appended
      .filter((e) => e.type === 'progress.record.completed')
      .map((e) => e.data.targetType);
    // a1, a2+m1, a3+m2+course
    expect(completedTargets).toEqual([
      'activity',
      'activity',
      'module',
      'activity',
      'module',
      'course',
    ]);
  });

  it('draft activities (published: false) are excluded from the denominator', async () => {
    const s = structure();
    (s.activities[1]! as { settings: unknown }).settings = { published: false };
    const { svc, records } = makeService(s);
    await svc.report(input('a1', [{ completed: true }]), learner);
    expect(
      records.find((r) => r.targetType === 'module' && r.targetId === 'm1')?.completedAt,
    ).toBeTruthy();
  });

  it('rejects a report for an activity not in the course', async () => {
    const { svc } = makeService(structure());
    await expect(svc.report(input('nope', []), learner)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects a report for a draft activity (published: false)', async () => {
    const { svc } = makeService(structure({ a1Settings: { published: false } }));
    await expect(svc.report(input('a1', []), learner)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects a report from a student without access to the course', async () => {
    const { svc, records } = makeService(structure(), { hasAccess: false });
    await expect(svc.report(input('a1', [{ completed: true }]), learner)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(records).toHaveLength(0);
  });

  it('rejects a report for an activity in an unpublished course', async () => {
    const { svc } = makeService(structure(), { courseStatus: 'draft' });
    await expect(svc.report(input('a1', []), learner)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('records the report against the actor', async () => {
    const { svc } = makeService(structure());
    const record = await svc.report(input('a1', []), learner);
    expect(record.orgUserId).toBe('s1');
  });

  it('takes a report without a grant from a holder of courses:read on that course', async () => {
    const reader = actorWith({ id: 's2', orgId: 'org-1', content: { c1: ['courses:read'] } });
    const other = actorWith({ id: 's3', orgId: 'org-1', content: { c2: ['courses:read'] } });
    const { svc } = makeService(structure(), { hasAccess: false, courseStatus: 'draft' });
    await expect(svc.report(input('a1', []), reader)).resolves.toMatchObject({ orgUserId: 's2' });
    await expect(svc.report(input('a1', []), other)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('completed claim on an explicit manual rule completes it', async () => {
    const { svc, appended } = makeService(
      structure({ a1Settings: { completion: { rule: 'manual' } } }),
    );
    const record = await svc.report(input('a1', [{ completed: true }]), learner);
    expect(record.completedAt).toEqual(new Date('2026-07-23T10:00:00.000Z'));
    expect(appended.filter((e) => e.type === 'progress.record.completed')).toHaveLength(1);
  });
});

describe('ProgressService reads', () => {
  it('get and listByTargets return stored records', async () => {
    const { svc } = makeService(structure());
    await svc.report(input('a1', [{ completed: true }]), learner);
    const rec = await svc.get('org-1', { orgUserId: 's1', targetType: 'activity', targetId: 'a1' });
    expect(rec?.completedAt).toBeTruthy();
    const list = await svc.listByTargets('org-1', 's1', ['a1', 'a2']);
    expect(list).toHaveLength(1);
  });
});
