import { describe, it, expect } from 'vitest';
import { LearnReportServiceImpl } from './service.js';
import type { LearnEntitlementReader, CourseRef } from './index.js';
import type { ContentService, Course, Module } from '../../core/content/index.js';
import type { ProgressRecord, ProgressService } from '../../core/progress/index.js';

function fakeProgress(records: ProgressRecord[]): ProgressService {
  return {
    report: async () => records[0]!,
    get: async (_orgId, target) =>
      records.find((r) => r.targetType === target.targetType && r.targetId === target.targetId) ??
      null,
    listByTargets: async (_orgId, _studentId, targetIds) =>
      records.filter((r) => r.targetType === 'activity' && targetIds.includes(r.targetId)),
  };
}

function progressRecord(
  partial: Partial<ProgressRecord> & Pick<ProgressRecord, 'targetType' | 'targetId'>,
): ProgressRecord {
  return {
    id: `p_${partial.targetId}`,
    orgId: 'o1',
    studentId: 'stu_1',
    startedAt: '2026-07-23T09:00:00Z',
    position: null,
    completedAt: null,
    ...partial,
  };
}

function course(id: string, status: 'draft' | 'published' = 'published'): Course {
  return {
    id,
    title: `C ${id}`,
    slug: id,
    description: '',
    status,
    category: '',
    moduleCount: 0,
    activityCount: 0,
    enrolledCount: 0,
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

function fakeReader(refs: CourseRef[]): LearnEntitlementReader {
  return {
    activeRefs: async (orgId) => refs.filter((r) => r.orgId === orgId),
    activeRef: async (orgId, _s, courseId) =>
      refs.find((r) => r.orgId === orgId && r.courseId === courseId) ?? null,
  };
}

// Minimal ContentService fake: only get() and listForCourse() are exercised.
function fakeContent(
  courses: Record<string, Course>,
  modules: Record<string, Module[]>,
): ContentService {
  return {
    get: async (_org: string, id: string) => courses[id] ?? null,
    listForCourse: async (_org: string, courseId: string) => modules[courseId] ?? [],
  } as unknown as ContentService;
}

describe('LearnReportServiceImpl', () => {
  it('lists only published courses the student is enrolled in', async () => {
    const svc = new LearnReportServiceImpl(
      fakeReader([
        { orgId: 'o1', courseId: 'c1' },
        { orgId: 'o1', courseId: 'c2' },
      ]),
      fakeContent({ c1: course('c1', 'published'), c2: course('c2', 'draft') }, {}),
      fakeProgress([]),
    );
    const rows = await svc.listCourses('o1', 'stu_1');
    expect(rows.map((c) => c.id)).toEqual(['c1']);
  });

  it('returns null for a course the student is not enrolled in', async () => {
    const svc = new LearnReportServiceImpl(
      fakeReader([{ orgId: 'o1', courseId: 'c1' }]),
      fakeContent({ c1: course('c1') }, {}),
      fakeProgress([]),
    );
    expect(await svc.getCourse('o1', 'stu_1', 'cX')).toBeNull();
    expect(await svc.listModules('o1', 'stu_1', 'cX')).toBeNull();
  });

  it('does not return a course enrolled in another org', async () => {
    const svc = new LearnReportServiceImpl(
      fakeReader([{ orgId: 'o2', courseId: 'c1' }]),
      fakeContent({ c1: course('c1') }, {}),
      fakeProgress([]),
    );
    expect(await svc.listCourses('o1', 'stu_1')).toEqual([]);
    expect(await svc.getCourse('o1', 'stu_1', 'c1')).toBeNull();
  });

  it('filters unpublished activities out of the module tree', async () => {
    const modules: Module[] = [
      {
        id: 'm1',
        courseId: 'c1',
        title: 'M1',
        seq: 0,
        activities: [
          { id: 'a1', moduleId: 'm1', seq: 0, settings: { published: true }, assetIds: [] },
          { id: 'a2', moduleId: 'm1', seq: 1, settings: { published: false }, assetIds: [] },
          { id: 'a3', moduleId: 'm1', seq: 2, settings: { title: 'no flag' }, assetIds: [] },
        ],
      },
    ];
    const svc = new LearnReportServiceImpl(
      fakeReader([{ orgId: 'o1', courseId: 'c1' }]),
      fakeContent({ c1: course('c1') }, { c1: modules }),
      fakeProgress([]),
    );
    const result = await svc.listModules('o1', 'stu_1', 'c1');
    expect(result?.[0]?.activities.map((a) => a.id)).toEqual(['a1', 'a3']);
  });
});

// One module: a1 + a2 published, a3 a draft.
const progressModules: Module[] = [
  {
    id: 'm1',
    courseId: 'c1',
    title: 'M1',
    seq: 0,
    activities: [
      { id: 'a1', moduleId: 'm1', seq: 0, settings: {}, assetIds: [] },
      { id: 'a2', moduleId: 'm1', seq: 1, settings: {}, assetIds: [] },
      { id: 'a3', moduleId: 'm1', seq: 2, settings: { published: false }, assetIds: [] },
    ],
  },
];

describe('LearnReportServiceImpl.courseProgress', () => {
  it('returns null when the student is not enrolled', async () => {
    const svc = new LearnReportServiceImpl(
      fakeReader([]),
      fakeContent({ c1: course('c1') }, { c1: progressModules }),
      fakeProgress([]),
    );
    expect(await svc.courseProgress('o1', 'stu_1', 'c1')).toBeNull();
  });

  it('maps records to statuses and derives percent from published activities only', async () => {
    const svc = new LearnReportServiceImpl(
      fakeReader([{ orgId: 'o1', courseId: 'c1' }]),
      fakeContent({ c1: course('c1') }, { c1: progressModules }),
      fakeProgress([
        progressRecord({ targetType: 'activity', targetId: 'a1', completedAt: '2026-07-23T09:30:00Z' }),
        progressRecord({ targetType: 'activity', targetId: 'a2' }),
        progressRecord({ targetType: 'activity', targetId: 'a3', completedAt: '2026-07-23T09:31:00Z' }),
      ]),
    );
    const view = await svc.courseProgress('o1', 'stu_1', 'c1');
    // a3 is a draft — absent from the map and the denominator
    expect(view).toEqual({
      activities: { a1: 'completed', a2: 'in-progress' },
      percent: 50,
      completed: false,
    });
  });

  it('completed reflects the course target record', async () => {
    const svc = new LearnReportServiceImpl(
      fakeReader([{ orgId: 'o1', courseId: 'c1' }]),
      fakeContent({ c1: course('c1') }, { c1: progressModules }),
      fakeProgress([
        progressRecord({ targetType: 'activity', targetId: 'a1', completedAt: '2026-07-23T09:30:00Z' }),
        progressRecord({ targetType: 'activity', targetId: 'a2', completedAt: '2026-07-23T09:32:00Z' }),
        progressRecord({ targetType: 'course', targetId: 'c1', completedAt: '2026-07-23T09:32:00Z' }),
      ]),
    );
    const view = await svc.courseProgress('o1', 'stu_1', 'c1');
    expect(view).toMatchObject({ percent: 100, completed: true });
  });
});
