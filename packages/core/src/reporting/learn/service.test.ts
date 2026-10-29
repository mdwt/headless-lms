import { describe, it, expect } from 'vitest';
import { LearnReportServiceImpl } from './service.js';
import type { EntitlementsService } from '../../entitlements/index.js';
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

type Access = Pick<EntitlementsService, 'hasAccess' | 'listAccessibleContent'>;

function fakeAccess(grants: { orgId: string; contentId: string }[]): Access {
  return {
    hasAccess: async (orgId, _s, contentId) =>
      grants.some((g) => g.orgId === orgId && g.contentId === contentId),
    listAccessibleContent: async (orgId) =>
      grants.filter((g) => g.orgId === orgId).map((g) => g.contentId),
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

describe('LearnReportServiceImpl', () => {
  it('lists only published courses the student is enrolled in', async () => {
    const svc = new LearnReportServiceImpl({
      access: fakeAccess([
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
      access: fakeAccess([{ orgId: 'o1', contentId: 'c1' }]),
      content: fakeContent({ c1: course('c1') }, {}),
      progress: fakeProgress([]),
      assets: fakeAssets(),
      deliveryExpirySeconds: 300,
    });
    expect(await svc.getCourse('o1', 'stu_1', 'cX')).toBeNull();
    expect(await svc.listModules('o1', 'stu_1', 'cX')).toBeNull();
  });

  it('returns null for the structure of an unpublished course', async () => {
    const svc = new LearnReportServiceImpl({
      access: fakeAccess([{ orgId: 'o1', contentId: 'c1' }]),
      content: fakeContent({ c1: course('c1', 'draft') }, { c1: progressModules }),
      progress: fakeProgress([]),
      assets: fakeAssets(),
      deliveryExpirySeconds: 300,
    });
    expect(await svc.listModules('o1', 'stu_1', 'c1')).toBeNull();
  });

  it('does not return a course enrolled in another org', async () => {
    const svc = new LearnReportServiceImpl({
      access: fakeAccess([{ orgId: 'o2', contentId: 'c1' }]),
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
      access: fakeAccess([]),
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
      access: fakeAccess([{ orgId: 'o1', contentId: 'c1' }]),
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
      access: fakeAccess([{ orgId: 'o1', contentId: 'c1' }]),
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
      access: fakeAccess([{ orgId: 'o1', contentId: 'c1' }]),
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

  it('returns null when the student has no access', async () => {
    const captured: { expiry?: number; filename?: string } = {};
    const svc = new LearnReportServiceImpl({
      access: fakeAccess([]),
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
      access: fakeAccess([{ orgId: 'o1', contentId: 'd1' }]),
      content: fakeContentService({
        getDownload: async () => download,
        listDownloadAssets: async () => [link()],
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
      access: fakeAccess([{ orgId: 'o1', contentId: 'd1' }]),
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

  it('returns null when the download is not published', async () => {
    const captured: { expiry?: number; filename?: string } = {};
    const svc = new LearnReportServiceImpl({
      access: fakeAccess([{ orgId: 'o1', contentId: 'd1' }]),
      content: fakeContentService({
        getDownload: async () => ({ id: 'd1', status: 'draft' }) as never,
        listDownloadAssets: async () => [link()],
      }),
      progress: fakeProgress([]),
      assets: fakeAssets(captured),
      deliveryExpirySeconds: 300,
    });

    expect(await svc.downloadAssetUrl('o1', 'stu_1', 'd1', 'a1')).toBeNull();
    expect(captured.expiry).toBeUndefined();
  });

  it('falls back to the asset filename when there is no display name', async () => {
    const captured: { expiry?: number; filename?: string } = {};
    const svc = new LearnReportServiceImpl({
      access: fakeAccess([{ orgId: 'o1', contentId: 'd1' }]),
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

describe('lesson asset delivery', () => {
  const lesson = activity('l1', 0);
  const linked = (activityId = 'l1', assetId = 'a1') => ({
    orgId: 'o1',
    id: `aa_${activityId}_${assetId}`,
    activityId,
    assetId,
    seq: 0,
    createdAt: AT,
    updatedAt: AT,
  });
  const build = (
    over: {
      access?: { orgId: string; contentId: string }[];
      lesson?: Activity;
      course?: Course;
      links?: ReturnType<typeof linked>[];
    } = {},
  ) => {
    const captured: { expiry?: number; filename?: string } = {};
    const svc = new LearnReportServiceImpl({
      access: fakeAccess(over.access ?? [{ orgId: 'o1', contentId: 'c1' }]),
      content: fakeContentService({
        getActivity: async (_o, id) => {
          const a = over.lesson ?? lesson;
          return a.id === id ? a : null;
        },
        getCourse: async (_o, id) => (id === 'c1' ? (over.course ?? course('c1')) : null),
        listCourseActivityAssets: async () => over.links ?? [linked()],
      }),
      progress: fakeProgress([]),
      assets: fakeAssets(captured),
      deliveryExpirySeconds: 300,
    });
    return { svc, captured };
  };

  it('signs an asset linked to a published lesson the student can open', async () => {
    const { svc, captured } = build();
    expect(await svc.activityAssetUrl('o1', 'stu_1', 'l1', 'a1')).toEqual({
      url: 'https://storage.example/signed',
    });
    expect(captured.expiry).toBe(300);
  });

  it('returns null without access to the course', async () => {
    const { svc, captured } = build({ access: [] });
    expect(await svc.activityAssetUrl('o1', 'stu_1', 'l1', 'a1')).toBeNull();
    expect(captured.expiry).toBeUndefined();
  });

  it('returns null for an asset not linked to the lesson', async () => {
    const { svc, captured } = build({ links: [linked('l2', 'a1'), linked('l1', 'a_other')] });
    expect(await svc.activityAssetUrl('o1', 'stu_1', 'l1', 'a1')).toBeNull();
    expect(captured.expiry).toBeUndefined();
  });

  it('returns null for a draft lesson or an unpublished course', async () => {
    const draft = build({ lesson: activity('l1', 0, { published: false }) });
    expect(await draft.svc.activityAssetUrl('o1', 'stu_1', 'l1', 'a1')).toBeNull();
    const unpublished = build({ course: course('c1', 'draft') });
    expect(await unpublished.svc.activityAssetUrl('o1', 'stu_1', 'l1', 'a1')).toBeNull();
  });
});

describe('download thumbnail', () => {
  const build = (download: unknown) =>
    new LearnReportServiceImpl({
      access: fakeAccess([]),
      content: fakeContentService({ getDownload: async () => download as never }),
      progress: fakeProgress([]),
      assets: fakeAssets(),
      deliveryExpirySeconds: 300,
    });

  it('signs the thumbnail of a published download without an access check', async () => {
    const svc = build({ id: 'd1', status: 'published', thumbnailAssetId: 'a1' });
    expect(await svc.downloadThumbnailUrl('o1', 'd1')).toEqual({
      url: 'https://storage.example/signed',
    });
  });

  it('returns null for an unpublished download or one without a thumbnail', async () => {
    expect(
      await build({ id: 'd1', status: 'draft', thumbnailAssetId: 'a1' }).downloadThumbnailUrl(
        'o1',
        'd1',
      ),
    ).toBeNull();
    expect(
      await build({ id: 'd1', status: 'published', thumbnailAssetId: null }).downloadThumbnailUrl(
        'o1',
        'd1',
      ),
    ).toBeNull();
  });
});
