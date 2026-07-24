import { describe, it, expect } from 'vitest';
import { ProgressServiceImpl } from './service.js';
import type { ProgressRepository, ProgressUnitOfWork } from './ports.js';
import type { ProgressRecord } from './model.js';
import type { NewProgressEvent } from './events.js';
import type { ContentService, Module } from '../content/index.js';
import type { ProgressReportItem } from './types.js';
import { NotFoundError } from '../shared/errors.js';

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
            r.studentId === target.studentId &&
            r.targetType === target.targetType &&
            r.targetId === target.targetId,
        ) ?? null
      );
    },
    async findByTargets(orgId, studentId, targetIds) {
      return records.filter(
        (r) => r.orgId === orgId && r.studentId === studentId && targetIds.includes(r.targetId),
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

/** One course, two modules: m1 = [a1 (manual), a2 (manual)], m2 = [a3 (manual)]. */
function structure(overrides?: { a1Settings?: unknown }): Module[] {
  return [
    {
      id: 'm1',
      courseId: 'c1',
      title: 'Module 1',
      seq: 0,
      activities: [
        { id: 'a1', moduleId: 'm1', seq: 0, settings: overrides?.a1Settings ?? {}, assetIds: [] },
        { id: 'a2', moduleId: 'm1', seq: 1, settings: {}, assetIds: [] },
      ],
    },
    {
      id: 'm2',
      courseId: 'c1',
      title: 'Module 2',
      seq: 1,
      activities: [{ id: 'a3', moduleId: 'm2', seq: 0, settings: {}, assetIds: [] }],
    },
  ];
}

function fakeContent(modules: Module[]): ContentService {
  const all = modules.flatMap((m) => m.activities);
  return {
    listForCourse: async () => modules,
    getActivity: async (_orgId: string, id: string) => all.find((a) => a.id === id) ?? null,
    getModule: async (_orgId: string, id: string) => modules.find((m) => m.id === id) ?? null,
  } as unknown as ContentService;
}

function makeService(modules: Module[]) {
  const { repo, records } = fakeRepo();
  const { uow, appended } = fakeUow(repo);
  const svc = new ProgressServiceImpl(repo, fakeContent(modules), uow, () => '2026-07-23T10:00:00Z');
  return { svc, records, appended };
}

const input = (activityId: string, reports: ProgressReportItem[]) => ({
  studentId: 's1',
  activityId,
  reports,
});

describe('ProgressService.report', () => {
  it('bare report creates the record and emits progress.started once', async () => {
    const { svc, records, appended } = makeService(structure());
    const first = await svc.report('org-1', input('a1', []));
    const second = await svc.report('org-1', input('a1', []));
    expect(first.id).toBe(second.id);
    expect(records).toHaveLength(1);
    expect(records[0]?.startedAt).toBe('2026-07-23T10:00:00Z');
    expect(appended).toHaveLength(1);
    expect(appended[0]).toMatchObject({ type: 'progress.started', orgId: 'org-1' });
    expect(appended[0]).not.toHaveProperty('courseId');
  });

  it('payload items store per-subject state without completing', async () => {
    const { svc, appended } = makeService(structure());
    const record = await svc.report(
      'org-1',
      input('a1', [
        { asset: 'ast_v1', seconds: 612 },
        { asset: 'ast_q1', answers: { q1: 'b' }, score: 0.8 },
        { page: 3 },
      ]),
    );
    expect(record.position).toEqual({
      ast_v1: { seconds: 612 },
      ast_q1: { answers: { q1: 'b' }, score: 0.8 },
      self: { page: 3 },
    });
    expect(record.completedAt).toBeNull();
    expect(appended.filter((e) => e.type === 'progress.completed')).toHaveLength(0);
  });

  it('a later report replaces its subject and preserves the others', async () => {
    const { svc } = makeService(structure());
    await svc.report('org-1', input('a1', [{ asset: 'ast_v1', seconds: 10 }]));
    const record = await svc.report('org-1', input('a1', [{ asset: 'ast_v2', seconds: 99 }]));
    expect(record.position).toEqual({ ast_v1: { seconds: 10 }, ast_v2: { seconds: 99 } });
  });

  it('a batch can carry state and the claim together', async () => {
    const { svc } = makeService(structure());
    const record = await svc.report(
      'org-1',
      input('a1', [{ asset: 'ast_v1', seconds: 612 }, { completed: true }]),
    );
    expect(record.completedAt).toBe('2026-07-23T10:00:00Z');
    expect(record.position).toEqual({ ast_v1: { seconds: 612 } });
  });

  it('completed claim on a rule-less activity completes it and emits progress.completed', async () => {
    const { svc, appended } = makeService(structure());
    const record = await svc.report('org-1', input('a1', [{ completed: true }]));
    expect(record.completedAt).toBe('2026-07-23T10:00:00Z');
    const completed = appended.filter((e) => e.type === 'progress.completed');
    expect(completed).toHaveLength(1);
    expect((completed[0] as { record: ProgressRecord }).record.targetId).toBe('a1');
  });

  it('completed claim with an unmet rule records nothing', async () => {
    const { svc, appended } = makeService(
      structure({ a1Settings: { completion: { rule: 'watch-percent', percent: 80 } } }),
    );
    const record = await svc.report('org-1', input('a1', [{ completed: true }]));
    expect(record.completedAt).toBeNull();
    expect(appended.filter((e) => e.type === 'progress.completed')).toHaveLength(0);
  });

  it('re-claiming a completed activity changes nothing and emits nothing', async () => {
    const { svc, appended } = makeService(structure());
    await svc.report('org-1', input('a1', [{ completed: true }]));
    const before = appended.length;
    await svc.report('org-1', input('a1', [{ completed: true }]));
    expect(appended).toHaveLength(before);
  });

  it('last activity of a module completes the module; last module completes the course', async () => {
    const { svc, records, appended } = makeService(structure());
    await svc.report('org-1', input('a1', [{ completed: true }]));
    await svc.report('org-1', input('a2', [{ completed: true }]));
    // m1 done, course not (a3 open)
    expect(records.find((r) => r.targetType === 'module' && r.targetId === 'm1')?.completedAt).toBe(
      '2026-07-23T10:00:00Z',
    );
    expect(records.find((r) => r.targetType === 'course')).toBeUndefined();
    await svc.report('org-1', input('a3', [{ completed: true }]));
    expect(records.find((r) => r.targetType === 'module' && r.targetId === 'm2')?.completedAt).toBeTruthy();
    expect(records.find((r) => r.targetType === 'course' && r.targetId === 'c1')?.completedAt).toBeTruthy();
    const completedTargets = appended
      .filter((e) => e.type === 'progress.completed')
      .map((e) => (e as { record: ProgressRecord }).record.targetType);
    // a1, a2+m1, a3+m2+course
    expect(completedTargets).toEqual(['activity', 'activity', 'module', 'activity', 'module', 'course']);
  });

  it('draft activities (published: false) are excluded from the denominator', async () => {
    const modules = structure();
    (modules[0]!.activities[1]! as { settings: unknown }).settings = { published: false };
    const { svc, records } = makeService(modules);
    await svc.report('org-1', input('a1', [{ completed: true }]));
    expect(records.find((r) => r.targetType === 'module' && r.targetId === 'm1')?.completedAt).toBeTruthy();
  });

  it('rejects a report for an activity not in the course', async () => {
    const { svc } = makeService(structure());
    await expect(svc.report('org-1', input('nope', []))).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects a report for a draft activity (published: false)', async () => {
    const { svc } = makeService(structure({ a1Settings: { published: false } }));
    await expect(svc.report('org-1', input('a1', []))).rejects.toBeInstanceOf(NotFoundError);
  });

  it('completed claim on an explicit manual rule completes it', async () => {
    const { svc, appended } = makeService(
      structure({ a1Settings: { completion: { rule: 'manual' } } }),
    );
    const record = await svc.report('org-1', input('a1', [{ completed: true }]));
    expect(record.completedAt).toBe('2026-07-23T10:00:00Z');
    expect(appended.filter((e) => e.type === 'progress.completed')).toHaveLength(1);
  });
});

describe('ProgressService reads', () => {
  it('get and listByTargets return stored records', async () => {
    const { svc } = makeService(structure());
    await svc.report('org-1', input('a1', [{ completed: true }]));
    const rec = await svc.get('org-1', { studentId: 's1', targetType: 'activity', targetId: 'a1' });
    expect(rec?.completedAt).toBeTruthy();
    const list = await svc.listByTargets('org-1', 's1', ['a1', 'a2']);
    expect(list).toHaveLength(1);
  });
});
