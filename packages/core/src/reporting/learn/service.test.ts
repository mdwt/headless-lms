import { describe, it, expect } from 'vitest';
import { LearnReportServiceImpl } from './service.js';
import type { LearnEntitlementReader, ContentRef } from './index.js';
import type { Activity, ContentServicePort, Course, Module } from '../../content/index.js';
import type { ProgressRecord, ProgressService } from '../../progress/index.js';
import type { Asset, AssetsService } from '../../assets/index.js';

const AT = new Date('2026-01-01T00:00:00.000Z');

function fakeProgress(records: ProgressRecord[]): ProgressService {
  return {
    report: async () => records[0]!,
    get: async (_orgId, target) =>
      records.find((r) => r.targetType === target.targetType && r.targetId === target.targetId) ??
      null,
    listByTargets: async (_orgId, _orgUserId, targetIds) =>
      records.filter((r) => r.targetType === 'activity' && targetIds.includes(r.targetId)),
  };
}

function progressRecord(
  partial: Partial<ProgressRecord> & Pick<ProgressRecord, 'targetType' | 'targetId'>,
): ProgressRecord {
  return {
    id: `p_${partial.targetId}`,
    orgId: 'o1',
    orgUserId: 'stu_1',
    startedAt: new Date('2026-07-23T09:00:00Z'),
    position: null,
    completedAt: null,
    createdAt: new Date('2026-07-23T09:00:00Z'),
    updatedAt: new Date('2026-07-23T09:00:00Z'),
    ...partial,
  };
}

function course(id: string, status: 'draft' | 'published' = 'published'): Course {
  return {
    orgId: 'o1',
    id,
    type: 'course',
    title: `C ${id}`,
    slug: id,
    description: '',
    status,
    category: '',
    thumbnailAssetId: null,
    settings: { transcriptDownloads: false },
    createdAt: AT,
    updatedAt: AT,
  };
}

function activity(id: string, seq: number, settings: unknown = {}): Activity {
  return {
    orgId: 'o1',
    id,
    moduleId: 'm1',
    courseId: 'c1',
    seq,
    settings: settings as Activity['settings'],
    createdAt: AT,
    updatedAt: AT,
  };
}

function fakeReader(refs: ContentRef[]): LearnEntitlementReader {
  return {
    activeRefs: async (orgId) => refs.filter((r) => r.orgId === orgId),
    activeRef: async (orgId, _s, courseId) =>
      refs.find((r) => r.orgId === orgId && r.contentId === courseId) ?? null,
    activeDownloadRefs: async () => [],
    activeDownloadRef: async () => null,
    downloadHasAsset: async () => false,
  };
}

function fakeContent(
  courses: Record<string, Course>,
  modules: Record<string, Module[]>,
  activities: Record<string, Activity[]> = {},
): ContentServicePort {
  return {
    getCourse: async (_org: string, id: string) => courses[id] ?? null,
    listCourseModules: async (_org: string, courseId: string) => modules[courseId] ?? [],
    listCourseActivities: async (_org: string, courseId: string) => activities[courseId] ?? [],
  } as unknown as ContentServicePort;
}

const SIGNED_ASSET: Asset = {
  orgId: 'o1',
  id: 'a1',
  key: 'k1',
  kind: 'download',
  filename: 'ch1.pdf',
  contentType: 'application/pdf',
  size: 10,
  status: 'ready',
  uploadedBy: 'u1',
  createdAt: AT,
  updatedAt: AT,
};

// Neutral AssetsService fake for tests that don't exercise download delivery —
// the constructor now requires one, but only the "download delivery" suite below cares.
function fakeAssets(captured: { expiry?: number; filename?: string } = {}): AssetsService {
  return {
    requestUpload: async () => {
      throw new Error('not used');
    },
    confirm: async () => null,
    list: async () => ({ rows: [], total: 0, page: 1, pageSize: 20 }),
    get: async () => SIGNED_ASSET,
    requestDownload: async (_orgId, _id, filename, expiresInSeconds) => {
      captured.expiry = expiresInSeconds;
      captured.filename = filename;
      return { url: 'https://storage.example/signed', asset: {} as never };
    },
    remove: async () => false,
  };
}

// Full-surface ContentService fake for the download-delivery suite: every
// member rejects or returns empty by default, overridable per test.
function fakeContentService(over: Partial<ContentServicePort> = {}): ContentServicePort {
  const rejectMutation = async (): Promise<never> => {
    throw new Error('not used');
  };
  return {
    listCourses: async () => ({ rows: [], total: 0, page: 1, pageSize: 20 }),
    getCourse: async () => null,
    createCourse: rejectMutation,
    updateCourse: rejectMutation,
    patchCourseSettings: rejectMutation,
    deleteCourse: rejectMutation,
    listCourseModules: async () => [],
    listCourseActivities: async () => [],
    listCourseActivityAssets: async () => [],
    getActivity: async () => null,
    getModule: async () => null,
    reorderModules: rejectMutation,
    createModule: rejectMutation,
    updateModule: rejectMutation,
    deleteModule: rejectMutation,
    reorderActivities: rejectMutation,
    saveActivity: rejectMutation,
    deleteActivity: rejectMutation,
    listDownloads: async () => ({ rows: [], total: 0, page: 1, pageSize: 20 }),
    getDownload: async () => null,
    createDownload: rejectMutation,
    updateDownload: rejectMutation,
    removeDownload: rejectMutation,
    listDownloadAssets: async () => [],
    addDownloadAsset: rejectMutation,
    removeDownloadAsset: rejectMutation,
    renameDownloadAsset: rejectMutation,
    reorderDownloadAssets: rejectMutation,
    ...over,
  };
}

// Full-surface LearnEntitlementReader fake for the download-delivery suite.
function fakeEntitlementReader(over: Partial<LearnEntitlementReader> = {}): LearnEntitlementReader {
  return {
    activeRefs: async () => [],
    activeRef: async () => null,
    activeDownloadRefs: async () => [],
    activeDownloadRef: async () => null,
    downloadHasAsset: async () => false,
    ...over,
  };
}

describe('LearnReportServiceImpl', () => {
  it('lists only published courses the student is enrolled in', async () => {
    const svc = new LearnReportServiceImpl({
      reader: fakeReader([
        { orgId: 'o1', contentId: 'c1' },
        { orgId: 'o1', contentId: 'c2' },
      ]),
      content: fakeContent({ c1: course('c1', 'published'), c2: course('c2', 'draft') }, {}),
      progress: fakeProgress([]),
      assets: fakeAssets(),
      deliveryExpirySeconds: 300,
    });
    const rows = await svc.listCourses('o1', 'stu_1');
    expect(rows.map((c) => c.id)).toEqual(['c1']);
  });

  it('returns null for a course the student is not enrolled in', async () => {
    const svc = new LearnReportServiceImpl({
      reader: fakeReader([{ orgId: 'o1', contentId: 'c1' }]),
      content: fakeContent({ c1: course('c1') }, {}),
      progress: fakeProgress([]),
      assets: fakeAssets(),
      deliveryExpirySeconds: 300,
    });
    expect(await svc.getCourse('o1', 'stu_1', 'cX')).toBeNull();
    expect(await svc.listModules('o1', 'stu_1', 'cX')).toBeNull();
  });

  it('does not return a course enrolled in another org', async () => {
    const svc = new LearnReportServiceImpl({
      reader: fakeReader([{ orgId: 'o2', contentId: 'c1' }]),
      content: fakeContent({ c1: course('c1') }, {}),
      progress: fakeProgress([]),
      assets: fakeAssets(),
      deliveryExpirySeconds: 300,
    });
    expect(await svc.listCourses('o1', 'stu_1')).toEqual([]);
    expect(await svc.getCourse('o1', 'stu_1', 'c1')).toBeNull();
  });
});

// One module: a1 + a2 published, a3 a draft.
const progressModules: Module[] = [
  { orgId: 'o1', id: 'm1', courseId: 'c1', title: 'M1', seq: 0, createdAt: AT, updatedAt: AT },
];
const progressActivities: Activity[] = [
  activity('a1', 0),
  activity('a2', 1),
  activity('a3', 2, { published: false }),
];

describe('LearnReportServiceImpl.courseProgress', () => {
  it('returns null when the student is not enrolled', async () => {
    const svc = new LearnReportServiceImpl({
      reader: fakeReader([]),
      content: fakeContent(
        { c1: course('c1') },
        { c1: progressModules },
        { c1: progressActivities },
      ),
      progress: fakeProgress([]),
      assets: fakeAssets(),
      deliveryExpirySeconds: 300,
    });
    expect(await svc.courseProgress('o1', 'stu_1', 'c1')).toBeNull();
  });

  it('maps records to statuses and derives percent from published activities only', async () => {
    const svc = new LearnReportServiceImpl({
      reader: fakeReader([{ orgId: 'o1', contentId: 'c1' }]),
      content: fakeContent(
        { c1: course('c1') },
        { c1: progressModules },
        { c1: progressActivities },
      ),
      progress: fakeProgress([
        progressRecord({
          targetType: 'activity',
          targetId: 'a1',
          completedAt: new Date('2026-07-23T09:30:00Z'),
        }),
        progressRecord({ targetType: 'activity', targetId: 'a2' }),
        progressRecord({
          targetType: 'activity',
          targetId: 'a3',
          completedAt: new Date('2026-07-23T09:31:00Z'),
        }),
      ]),
      assets: fakeAssets(),
      deliveryExpirySeconds: 300,
    });
    const view = await svc.courseProgress('o1', 'stu_1', 'c1');
    // a3 is a draft — absent from the map and the denominator
    expect(view).toEqual({
      activities: { a1: 'completed', a2: 'in-progress' },
      percent: 50,
      completed: false,
      positions: {},
    });
  });

  it('completed reflects the course target record', async () => {
    const svc = new LearnReportServiceImpl({
      reader: fakeReader([{ orgId: 'o1', contentId: 'c1' }]),
      content: fakeContent(
        { c1: course('c1') },
        { c1: progressModules },
        { c1: progressActivities },
      ),
      progress: fakeProgress([
        progressRecord({
          targetType: 'activity',
          targetId: 'a1',
          completedAt: new Date('2026-07-23T09:30:00Z'),
        }),
        progressRecord({
          targetType: 'activity',
          targetId: 'a2',
          completedAt: new Date('2026-07-23T09:32:00Z'),
        }),
        progressRecord({
          targetType: 'course',
          targetId: 'c1',
          completedAt: new Date('2026-07-23T09:32:00Z'),
        }),
      ]),
      assets: fakeAssets(),
      deliveryExpirySeconds: 300,
    });
    const view = await svc.courseProgress('o1', 'stu_1', 'c1');
    expect(view).toMatchObject({ percent: 100, completed: true });
  });

  it('includes stored positions keyed by activity, omitting recordless activities', async () => {
    const svc = new LearnReportServiceImpl({
      reader: fakeReader([{ orgId: 'o1', contentId: 'c1' }]),
      content: fakeContent(
        { c1: course('c1') },
        { c1: progressModules },
        { c1: progressActivities },
      ),
      progress: fakeProgress([
        progressRecord({
          targetType: 'activity',
          targetId: 'a1',
          position: { vid_1: { seconds: 612, furthest: 700, duration: 1475 } },
        }),
        progressRecord({ targetType: 'activity', targetId: 'a2' }),
      ]),
      assets: fakeAssets(),
      deliveryExpirySeconds: 300,
    });
    const view = await svc.courseProgress('o1', 'stu_1', 'c1');
    expect(view?.positions).toEqual({
      a1: { vid_1: { seconds: 612, furthest: 700, duration: 1475 } },
    });
  });
});

describe('download delivery', () => {
  const download = { id: 'd1', status: 'published' } as never;
  const link = (over: Partial<{ assetId: string; displayName: string | null }> = {}) => ({
    orgId: 'o1',
    id: 'da1',
    downloadId: 'd1',
    assetId: 'a1',
    seq: 0,
    displayName: null,
    createdAt: AT,
    updatedAt: AT,
    ...over,
  });

  it('returns null when the student has no entitlement', async () => {
    const captured: { expiry?: number; filename?: string } = {};
    const svc = new LearnReportServiceImpl({
      reader: fakeEntitlementReader({
        // Both would let the request through if gate 1 were bypassed — only
        // the missing entitlement (activeDownloadRef → null) can produce
        // null here.
        downloadHasAsset: async () => true,
      }),
      content: fakeContentService({
        getDownload: async () => download,
        listDownloadAssets: async () => [link()],
      }),
      progress: fakeProgress([]),
      assets: fakeAssets(captured),
      deliveryExpirySeconds: 300,
    });

    expect(await svc.downloadAssetUrl('o1', 'stu_1', 'd1', 'a1')).toBeNull();
    expect(captured.expiry).toBeUndefined();
  });

  it('returns null when the asset belongs to a different download', async () => {
    const captured: { expiry?: number; filename?: string } = {};
    const svc = new LearnReportServiceImpl({
      reader: fakeEntitlementReader({
        activeDownloadRef: async () => ({ orgId: 'o1', contentId: 'd1' }),
        downloadHasAsset: async () => false,
      }),
      content: fakeContentService({
        getDownload: async () => download,
        // The link lookup itself would succeed for the requested asset id —
        // only the downloadHasAsset gate can produce null here.
        listDownloadAssets: async () => [link({ assetId: 'a_other' })],
      }),
      progress: fakeProgress([]),
      assets: fakeAssets(captured),
      deliveryExpirySeconds: 300,
    });

    expect(await svc.downloadAssetUrl('o1', 'stu_1', 'd1', 'a_other')).toBeNull();
    expect(captured.expiry).toBeUndefined();
  });

  it('signs with the configured expiry and the display name', async () => {
    const captured: { expiry?: number; filename?: string } = {};
    const svc = new LearnReportServiceImpl({
      reader: fakeEntitlementReader({
        activeDownloadRef: async () => ({ orgId: 'o1', contentId: 'd1' }),
        downloadHasAsset: async () => true,
      }),
      content: fakeContentService({
        getDownload: async () => download,
        listDownloadAssets: async () => [link({ displayName: 'Chapter One' })],
      }),
      progress: fakeProgress([]),
      assets: fakeAssets(captured),
      deliveryExpirySeconds: 300,
    });

    const result = await svc.downloadAssetUrl('o1', 'stu_1', 'd1', 'a1');

    expect(result?.url).toBe('https://storage.example/signed');
    expect(captured.expiry).toBe(300);
    expect(captured.filename).toBe('Chapter One');
  });

  it('falls back to the asset filename when there is no display name', async () => {
    const captured: { expiry?: number; filename?: string } = {};
    const svc = new LearnReportServiceImpl({
      reader: fakeEntitlementReader({
        activeDownloadRef: async () => ({ orgId: 'o1', contentId: 'd1' }),
        downloadHasAsset: async () => true,
      }),
      content: fakeContentService({
        getDownload: async () => download,
        listDownloadAssets: async () => [link()],
      }),
      progress: fakeProgress([]),
      assets: fakeAssets(captured),
      deliveryExpirySeconds: 300,
    });

    await svc.downloadAssetUrl('o1', 'stu_1', 'd1', 'a1');

    expect(captured.filename).toBe('ch1.pdf');
  });
});
