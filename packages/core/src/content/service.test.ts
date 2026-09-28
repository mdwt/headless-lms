import { describe, it, expect, vi } from 'vitest';
import { NotFoundError } from '../shared/errors.js';
import { ContentService } from './service.js';
import type { ContentRepository, ContentUnitOfWork } from './ports.js';
import type { Activity, Course, Download, DownloadAsset, Module } from './model.js';
import type { NewDomainEvent, OutboxAppender } from '../shared/ports.js';
const AT = new Date('2026-01-01T00:00:00.000Z');

function makeCourse(over: Partial<Course> = {}): Course {
  return {
    orgId: 'org1',
    id: 'c1',
    type: 'course',
    title: 'Intro',
    slug: 'intro',
    description: '',
    status: 'draft',
    category: '',
    thumbnailAssetId: null,
    settings: { transcriptDownloads: false },
    createdAt: AT,
    updatedAt: AT,
    ...over,
  };
}

function makeRepo(): ContentRepository {
  return {
    listCourses: vi.fn(),
    findCourseById: vi.fn(),
    createCourse: vi.fn(),
    updateCourse: vi.fn(),
    patchCourseSettings: vi.fn(),
    deleteCourse: vi.fn(),
    listCourseModules: vi.fn(),
    listActivitiesForCourse: vi.fn(),
    listActivityAssetsForCourse: vi.fn(),
    findActivity: vi.fn(),
    findModule: vi.fn(),
    reorderModules: vi.fn(),
    createModule: vi.fn(),
    updateModule: vi.fn(),
    deleteModule: vi.fn(),
    reorderActivities: vi.fn(),
    saveActivity: vi.fn(),
    deleteActivity: vi.fn(),
    listDownloads: vi.fn(),
    getDownload: vi.fn(),
    createDownload: vi.fn(),
    updateDownload: vi.fn(),
    deleteDownload: vi.fn(),
    listDownloadAssets: vi.fn(),
    addDownloadAsset: vi.fn(),
    removeDownloadAsset: vi.fn(),
    renameDownloadAsset: vi.fn(),
    reorderDownloadAssets: vi.fn(),
    listBundles: vi.fn(),
    findBundleById: vi.fn(),
    createBundle: vi.fn(),
    updateBundle: vi.fn(),
    deleteBundle: vi.fn(),
    listBundleItems: vi.fn(),
    addBundleItem: vi.fn(),
    removeBundleItem: vi.fn(),
  };
}

/** Pass-through unit of work: runs the callback with the fake repo as the
 *  tx-bound scope plus a capturing outbox appender. */
function fakeUow(repo: ContentRepository) {
  const appended: NewDomainEvent[] = [];
  const append = vi.fn(async (events: NewDomainEvent[]) => {
    appended.push(...events);
  });
  const outbox: OutboxAppender = { append };
  const uow: ContentUnitOfWork = {
    run: (fn) => fn({ content: repo, outbox }),
  };
  return { uow, append, appended };
}

function build(repo = makeRepo()) {
  const { uow, append, appended } = fakeUow(repo);
  const svc = new ContentService({ repo, uow });
  return { svc, repo, append, appended };
}

function makeActivity(over: Partial<Activity> = {}): Activity {
  return {
    orgId: 'org1',
    id: 'act1',
    moduleId: 'm1',
    courseId: 'c1',
    seq: 0,
    settings: {},
    createdAt: AT,
    updatedAt: AT,
    ...over,
  };
}

function makeModule(over: Partial<Module> = {}): Module {
  return {
    orgId: 'org1',
    id: 'm1',
    courseId: 'c1',
    title: 'Module 1',
    seq: 0,
    createdAt: AT,
    updatedAt: AT,
    ...over,
  };
}

describe('ContentServiceImpl', () => {
  it('derives the slug from the title on create', async () => {
    const repo = makeRepo();
    const created = makeCourse({ title: 'My New Course', slug: 'my-new-course' });
    (repo.createCourse as ReturnType<typeof vi.fn>).mockResolvedValue(created);

    const { svc } = build(repo);
    const result = await svc.createCourse('org1', { title: 'My New Course' });

    expect(repo.createCourse).toHaveBeenCalledWith(
      'org1',
      { title: 'My New Course' },
      'my-new-course',
    );
    expect(result).toEqual(created);
  });

  it('delegates course reads to the content repository', async () => {
    const repo = makeRepo();
    const course = makeCourse();
    (repo.findCourseById as ReturnType<typeof vi.fn>).mockResolvedValue(course);

    const { svc, append } = build(repo);
    const result = await svc.getCourse('org1', 'c1');

    expect(repo.findCourseById).toHaveBeenCalledWith('org1', 'c1');
    expect(result).toEqual({ ...course, settings: { transcriptDownloads: false } });
    expect(append).not.toHaveBeenCalled();
  });

  it('delegates a settings patch to the repository and returns its result', async () => {
    const repo = makeRepo();
    (repo.findCourseById as ReturnType<typeof vi.fn>).mockResolvedValue(makeCourse());
    (repo.patchCourseSettings as ReturnType<typeof vi.fn>).mockResolvedValue({
      transcriptDownloads: true,
    });

    const { svc } = build(repo);
    const result = await svc.patchCourseSettings('org1', 'c1', { transcriptDownloads: true });

    expect(repo.patchCourseSettings).toHaveBeenCalledWith('org1', 'c1', {
      transcriptDownloads: true,
    });
    expect(result).toEqual({ transcriptDownloads: true });
  });

  it('throws NotFoundError when patching settings on a course that does not exist', async () => {
    const repo = makeRepo();
    (repo.findCourseById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const { svc } = build(repo);

    await expect(svc.patchCourseSettings('org1', 'missing', {})).rejects.toThrow(NotFoundError);
    expect(repo.patchCourseSettings).not.toHaveBeenCalled();
  });

  it('appends course.updated carrying the merged settings on a settings patch', async () => {
    const repo = makeRepo();
    const course = makeCourse();
    (repo.findCourseById as ReturnType<typeof vi.fn>).mockResolvedValue(course);
    (repo.patchCourseSettings as ReturnType<typeof vi.fn>).mockResolvedValue({
      transcriptDownloads: true,
    });

    const { svc, appended } = build(repo);
    await svc.patchCourseSettings('org1', 'c1', { transcriptDownloads: true });

    expect(appended).toEqual([
      {
        type: 'content.course.updated',
        version: 1,
        orgId: 'org1',
        data: { ...course, settings: { transcriptDownloads: true } },
      },
    ]);
  });

  it('appends nothing when a settings patch finds no course', async () => {
    const repo = makeRepo();
    (repo.findCourseById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const { svc, append } = build(repo);
    await expect(svc.patchCourseSettings('org1', 'missing', {})).rejects.toThrow(NotFoundError);
    expect(append).not.toHaveBeenCalled();
  });

  it('appends course.created (org + full snapshot) inside the unit of work', async () => {
    const repo = makeRepo();
    const created = makeCourse();
    (repo.createCourse as ReturnType<typeof vi.fn>).mockResolvedValue(created);

    const { svc, appended } = build(repo);
    await svc.createCourse('org1', { title: 'Intro' });

    expect(appended).toEqual([
      { type: 'content.course.created', version: 1, orgId: 'org1', data: created },
    ]);
  });

  it('appends course.updated with the updated snapshot', async () => {
    const repo = makeRepo();
    const updated = makeCourse({ title: 'Renamed' });
    (repo.updateCourse as ReturnType<typeof vi.fn>).mockResolvedValue(updated);

    const { svc, appended } = build(repo);
    const result = await svc.updateCourse('org1', 'c1', { title: 'Renamed' });

    expect(repo.updateCourse).toHaveBeenCalledWith('org1', 'c1', { title: 'Renamed' });
    expect(result).toEqual(updated);
    expect(appended).toEqual([
      { type: 'content.course.updated', version: 1, orgId: 'org1', data: updated },
    ]);
  });

  it('throws NotFoundError and appends nothing when update finds no course', async () => {
    const repo = makeRepo();
    (repo.updateCourse as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const { svc, append } = build(repo);
    await expect(svc.updateCourse('org1', 'missing', { title: 'X' })).rejects.toThrow(
      NotFoundError,
    );
    expect(append).not.toHaveBeenCalled();
  });

  it('appends course.deleted with the pre-delete snapshot', async () => {
    const repo = makeRepo();
    const course = makeCourse();
    (repo.findCourseById as ReturnType<typeof vi.fn>).mockResolvedValue(course);
    (repo.deleteCourse as ReturnType<typeof vi.fn>).mockResolvedValue(true);

    const { svc, appended } = build(repo);
    await svc.deleteCourse('org1', 'c1');

    expect(appended).toEqual([
      { type: 'content.course.deleted', version: 1, orgId: 'org1', data: course },
    ]);
  });

  it('throws NotFoundError and appends nothing when remove finds no course', async () => {
    const repo = makeRepo();
    (repo.findCourseById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const { svc, repo: r, append } = build(repo);
    await expect(svc.deleteCourse('org1', 'missing')).rejects.toThrow(NotFoundError);
    expect(r.deleteCourse).not.toHaveBeenCalled();
    expect(append).not.toHaveBeenCalled();
  });

  it('throws NotFoundError when the course vanishes between snapshot and delete', async () => {
    const repo = makeRepo();
    (repo.findCourseById as ReturnType<typeof vi.fn>).mockResolvedValue(makeCourse());
    (repo.deleteCourse as ReturnType<typeof vi.fn>).mockResolvedValue(false);

    const { svc, append } = build(repo);
    await expect(svc.deleteCourse('org1', 'c1')).rejects.toThrow(NotFoundError);
    expect(append).not.toHaveBeenCalled();
  });

  it('does not append when the write fails — the error propagates out of run', async () => {
    const repo = makeRepo();
    (repo.createCourse as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('boom'));

    const { svc, append } = build(repo);
    await expect(svc.createCourse('org1', { title: 'Intro' })).rejects.toThrow('boom');
    expect(append).not.toHaveBeenCalled();
  });
});

describe('modules', () => {
  it('appends course.module.created with the new module snapshot', async () => {
    const repo = makeRepo();
    const created = makeModule({ id: 'm2', title: 'New Module', seq: 1 });
    const modules = [makeModule(), created];
    vi.mocked(repo.createModule).mockResolvedValue(modules);

    const { svc, appended } = build(repo);
    const result = await svc.createModule('org1', 'c1', 'New Module');

    expect(repo.createModule).toHaveBeenCalledWith('org1', 'c1', 'New Module');
    expect(result).toBe(modules);
    expect(appended).toEqual([
      {
        type: 'content.course.module.created',
        version: 1,
        orgId: 'org1',
        data: created,
      },
    ]);
  });

  it('appends course.module.updated with the updated snapshot', async () => {
    const repo = makeRepo();
    const updated = makeModule({ title: 'Renamed' });
    vi.mocked(repo.findModule).mockResolvedValue(makeModule());
    vi.mocked(repo.updateModule).mockResolvedValue([updated]);

    const { svc, appended } = build(repo);
    await svc.updateModule('org1', 'c1', 'm1', 'Renamed');

    expect(repo.updateModule).toHaveBeenCalledWith('org1', 'c1', 'm1', 'Renamed');
    expect(appended).toEqual([
      {
        type: 'content.course.module.updated',
        version: 1,
        orgId: 'org1',
        data: updated,
      },
    ]);
  });

  it('throws NotFoundError and appends nothing when updating a module outside the course', async () => {
    const repo = makeRepo();
    vi.mocked(repo.findModule).mockResolvedValue(makeModule({ courseId: 'other' }));

    const { svc, append } = build(repo);
    await expect(svc.updateModule('org1', 'c1', 'm1', 'Renamed')).rejects.toThrow(NotFoundError);
    expect(repo.updateModule).not.toHaveBeenCalled();
    expect(append).not.toHaveBeenCalled();
  });

  it('appends course.module.deleted with the pre-delete snapshot', async () => {
    const repo = makeRepo();
    const module = makeModule();
    vi.mocked(repo.findModule).mockResolvedValue(module);
    vi.mocked(repo.deleteModule).mockResolvedValue([]);

    const { svc, appended } = build(repo);
    const result = await svc.deleteModule('org1', 'c1', 'm1');

    expect(repo.deleteModule).toHaveBeenCalledWith('org1', 'c1', 'm1');
    expect(result).toEqual([]);
    expect(appended).toEqual([
      {
        type: 'content.course.module.deleted',
        version: 1,
        orgId: 'org1',
        data: module,
      },
    ]);
  });

  it('throws NotFoundError and appends nothing when deleting a missing module', async () => {
    const repo = makeRepo();
    vi.mocked(repo.findModule).mockResolvedValue(null);

    const { svc, append } = build(repo);
    await expect(svc.deleteModule('org1', 'c1', 'missing')).rejects.toThrow(NotFoundError);
    expect(repo.deleteModule).not.toHaveBeenCalled();
    expect(append).not.toHaveBeenCalled();
  });

  it('appends course.modules.reordered with the resulting order', async () => {
    const repo = makeRepo();
    const reordered = [makeModule({ id: 'm2', seq: 0 }), makeModule({ id: 'm1', seq: 1 })];
    vi.mocked(repo.reorderModules).mockResolvedValue(reordered);

    const { svc, appended } = build(repo);
    const result = await svc.reorderModules('org1', 'c1', ['m2', 'm1']);

    expect(result).toBe(reordered);
    expect(appended).toEqual([
      {
        type: 'content.course.modules.reordered',
        version: 1,
        orgId: 'org1',
        data: reordered,
      },
    ]);
  });
});

describe('activities', () => {
  it('appends course.activity.created with the new activity snapshot', async () => {
    const repo = makeRepo();
    const created = makeActivity({ id: 'act2', seq: 1 });
    const modules = [makeModule()];
    vi.mocked(repo.findModule).mockResolvedValue(makeModule());
    vi.mocked(repo.saveActivity).mockResolvedValue({ modules, activity: created });

    const { svc, appended } = build(repo);
    const result = await svc.saveActivity('org1', 'c1', 'm1', { settings: { title: 'A' } });

    expect(repo.saveActivity).toHaveBeenCalledWith(
      'org1',
      'c1',
      'm1',
      { settings: { title: 'A' } },
      undefined,
    );
    expect(result).toBe(modules);
    expect(appended).toEqual([
      {
        type: 'content.course.activity.created',
        version: 1,
        orgId: 'org1',
        data: created,
      },
    ]);
  });

  it('throws NotFoundError when creating an activity in a missing module', async () => {
    const repo = makeRepo();
    vi.mocked(repo.findModule).mockResolvedValue(null);

    const { svc, append } = build(repo);
    await expect(svc.saveActivity('org1', 'c1', 'missing', {})).rejects.toThrow(NotFoundError);
    expect(repo.saveActivity).not.toHaveBeenCalled();
    expect(append).not.toHaveBeenCalled();
  });

  it('appends course.activity.updated with the saved snapshot on update', async () => {
    const repo = makeRepo();
    const saved = makeActivity();
    vi.mocked(repo.findActivity).mockResolvedValue(makeActivity());
    vi.mocked(repo.saveActivity).mockResolvedValue({ modules: [makeModule()], activity: saved });

    const { svc, appended } = build(repo);
    await svc.saveActivity('org1', 'c1', 'm1', { assetIds: ['a1'] }, 'act1');

    expect(repo.saveActivity).toHaveBeenCalledWith(
      'org1',
      'c1',
      'm1',
      { assetIds: ['a1'] },
      'act1',
    );
    expect(appended).toEqual([
      {
        type: 'content.course.activity.updated',
        version: 1,
        orgId: 'org1',
        data: saved,
      },
    ]);
  });

  it('throws NotFoundError when updating an activity that lives in another module', async () => {
    const repo = makeRepo();
    vi.mocked(repo.findActivity).mockResolvedValue(makeActivity({ moduleId: 'other' }));

    const { svc, append } = build(repo);
    await expect(svc.saveActivity('org1', 'c1', 'm1', {}, 'act1')).rejects.toThrow(NotFoundError);
    expect(repo.saveActivity).not.toHaveBeenCalled();
    expect(append).not.toHaveBeenCalled();
  });

  it('appends course.activity.deleted with the pre-delete snapshot', async () => {
    const repo = makeRepo();
    const activity = makeActivity();
    vi.mocked(repo.findActivity).mockResolvedValue(activity);
    vi.mocked(repo.deleteActivity).mockResolvedValue([makeModule()]);

    const { svc, appended } = build(repo);
    await svc.deleteActivity('org1', 'c1', 'm1', 'act1');

    expect(repo.deleteActivity).toHaveBeenCalledWith('org1', 'c1', 'm1', 'act1');
    expect(appended).toEqual([
      {
        type: 'content.course.activity.deleted',
        version: 1,
        orgId: 'org1',
        data: activity,
      },
    ]);
  });

  it('throws NotFoundError and appends nothing when deleting a missing activity', async () => {
    const repo = makeRepo();
    vi.mocked(repo.findActivity).mockResolvedValue(null);

    const { svc, append } = build(repo);
    await expect(svc.deleteActivity('org1', 'c1', 'm1', 'missing')).rejects.toThrow(NotFoundError);
    expect(repo.deleteActivity).not.toHaveBeenCalled();
    expect(append).not.toHaveBeenCalled();
  });

  it('appends course.activities.reordered with the resulting order', async () => {
    const repo = makeRepo();
    const reordered = [makeModule()];
    vi.mocked(repo.reorderActivities).mockResolvedValue(reordered);

    const { svc, appended } = build(repo);
    const result = await svc.reorderActivities('org1', 'c1', 'm1', ['act2', 'act1']);

    expect(result).toBe(reordered);
    expect(appended).toEqual([
      {
        type: 'content.course.activities.reordered',
        version: 1,
        orgId: 'org1',
        data: reordered[0],
      },
    ]);
  });
});

describe('hierarchy reads', () => {
  it('getActivity and getModule delegate to the content repository', async () => {
    const repo = makeRepo();
    const activity = makeActivity({ settings: {} });
    const module = makeModule({ title: 'M1' });
    vi.mocked(repo.findActivity).mockResolvedValue(activity);
    vi.mocked(repo.findModule).mockResolvedValue(module);
    const { svc } = build(repo);
    expect(await svc.getActivity('o1', 'act1')).toEqual(activity);
    expect(await svc.getModule('o1', 'm1')).toEqual(module);
    expect(repo.findActivity).toHaveBeenCalledWith('o1', 'act1');
    expect(repo.findModule).toHaveBeenCalledWith('o1', 'm1');
  });

  it('resolve unknown ids to null', async () => {
    const repo = makeRepo();
    vi.mocked(repo.findActivity).mockResolvedValue(null);
    vi.mocked(repo.findModule).mockResolvedValue(null);
    const { svc } = build(repo);
    expect(await svc.getActivity('o1', 'nope')).toBeNull();
    expect(await svc.getModule('o1', 'nope')).toBeNull();
  });
});

describe('logging', () => {
  it('logs course create/update/delete at info with ids', async () => {
    const { createCapturingLogger } = await import('../shared/logger.js');
    const { logger, entries } = createCapturingLogger();
    const repo = makeRepo();
    const course = makeCourse();
    (repo.createCourse as ReturnType<typeof vi.fn>).mockResolvedValue(course);
    (repo.updateCourse as ReturnType<typeof vi.fn>).mockResolvedValue(course);
    (repo.findCourseById as ReturnType<typeof vi.fn>).mockResolvedValue(course);
    (repo.deleteCourse as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    const { uow } = fakeUow(repo);
    const svc = new ContentService({
      repo,
      uow,
      logger,
    });

    await svc.createCourse('org-1', { title: 'Intro' });
    await svc.updateCourse('org-1', course.id, { title: 'Intro 2' });
    await svc.deleteCourse('org-1', course.id);

    expect(entries.filter((e) => e.level === 'info').map((e) => e.msg)).toEqual([
      'course created',
      'course updated',
      'course deleted',
    ]);
    expect(entries[0]?.meta).toMatchObject({ orgId: 'org-1', courseId: course.id });
  });

  it('logs module and activity mutations with ids', async () => {
    const { createCapturingLogger } = await import('../shared/logger.js');
    const { logger, entries } = createCapturingLogger();
    const repo = makeRepo();
    const module = makeModule();
    const activity = makeActivity();
    vi.mocked(repo.createModule).mockResolvedValue([module]);
    vi.mocked(repo.findActivity).mockResolvedValue(activity);
    vi.mocked(repo.deleteActivity).mockResolvedValue([module]);
    const { uow } = fakeUow(repo);
    const svc = new ContentService({
      repo,
      uow,
      logger,
    });

    await svc.createModule('org-1', 'c1', 'Module 1');
    await svc.deleteActivity('org-1', 'c1', 'm1', 'act1');

    expect(entries.filter((e) => e.level === 'info').map((e) => e.msg)).toEqual([
      'module created',
      'activity deleted',
    ]);
    expect(entries[0]?.meta).toMatchObject({ orgId: 'org-1', courseId: 'c1', moduleId: 'm1' });
    expect(entries[1]?.meta).toMatchObject({
      orgId: 'org-1',
      courseId: 'c1',
      moduleId: 'm1',
      activityId: 'act1',
    });
  });

  it('logs a warn when a structure mutation is rejected', async () => {
    const { createCapturingLogger } = await import('../shared/logger.js');
    const { logger, entries } = createCapturingLogger();
    const repo = makeRepo();
    vi.mocked(repo.findModule).mockResolvedValue(null);
    const { uow } = fakeUow(repo);
    const svc = new ContentService({
      repo,
      uow,
      logger,
    });

    await expect(svc.deleteModule('org-1', 'c1', 'missing')).rejects.toThrow(NotFoundError);

    expect(entries.filter((e) => e.level === 'warn').map((e) => e.msg)).toEqual([
      'module delete rejected — not found in course',
    ]);
  });
});

function makeDownload(over: Partial<Download> = {}): Download {
  return {
    orgId: 'o1',
    id: 'd1',
    type: 'download',
    title: 'Workbook',
    slug: 'workbook',
    description: '',
    status: 'draft',
    category: '',
    thumbnailAssetId: null,
    createdAt: AT,
    updatedAt: AT,
    ...over,
  };
}

describe('downloads', () => {
  it('creates a download with a slugified title and appends download.created', async () => {
    const repo = makeRepo();
    const download = makeDownload({ title: 'My Great Workbook', slug: 'my-great-workbook' });
    vi.mocked(repo.createDownload).mockResolvedValue(download);

    const { svc, appended } = build(repo);
    const result = await svc.createDownload('o1', { title: 'My Great Workbook' });

    expect(repo.createDownload).toHaveBeenCalledWith(
      'o1',
      { title: 'My Great Workbook' },
      'my-great-workbook',
    );
    expect(result).toEqual(download);
    expect(appended).toEqual([
      { type: 'content.download.created', version: 1, orgId: 'o1', data: download },
    ]);
  });

  it('throws NotFoundError when updating a download that does not exist', async () => {
    const repo = makeRepo();
    vi.mocked(repo.updateDownload).mockResolvedValue(null);

    const { svc } = build(repo);

    await expect(svc.updateDownload('o1', 'missing', { title: 'x' })).rejects.toThrow(
      NotFoundError,
    );
  });

  it('appends download.deleted carrying the pre-delete snapshot', async () => {
    const repo = makeRepo();
    const download = makeDownload();
    vi.mocked(repo.getDownload).mockResolvedValue(download);
    vi.mocked(repo.deleteDownload).mockResolvedValue(true);

    const { svc, appended } = build(repo);
    await svc.removeDownload('o1', 'd1');

    expect(appended).toEqual([
      { type: 'content.download.deleted', version: 1, orgId: 'o1', data: download },
    ]);
  });

  it('throws NotFoundError when deleting a download that does not exist', async () => {
    const repo = makeRepo();
    vi.mocked(repo.getDownload).mockResolvedValue(null);

    const { svc } = build(repo);

    await expect(svc.removeDownload('o1', 'missing')).rejects.toThrow(NotFoundError);
    expect(repo.deleteDownload).not.toHaveBeenCalled();
  });
});

function makeDownloadAsset(over: Partial<DownloadAsset> = {}): DownloadAsset {
  return {
    orgId: 'o1',
    id: 'da1',
    downloadId: 'd1',
    assetId: 'a1',
    seq: 0,
    displayName: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...over,
  };
}

describe('download assets', () => {
  it('rejects a reorder whose ids are not exactly the current set', async () => {
    const repo = makeRepo();
    vi.mocked(repo.listDownloadAssets).mockResolvedValue([
      makeDownloadAsset({ id: 'da1', assetId: 'a1', seq: 0 }),
      makeDownloadAsset({ id: 'da2', assetId: 'a2', seq: 1 }),
    ]);
    const { svc } = build(repo);

    // Drops a2 — a stale client must not be able to silently unlink it.
    await expect(svc.reorderDownloadAssets('o1', 'd1', ['a1'])).rejects.toThrow(/does not match/i);
    expect(repo.reorderDownloadAssets).not.toHaveBeenCalled();
  });

  it('rejects a reorder containing an id not in the download', async () => {
    const repo = makeRepo();
    vi.mocked(repo.listDownloadAssets).mockResolvedValue([
      makeDownloadAsset({ id: 'da1', assetId: 'a1', seq: 0 }),
    ]);
    const { svc } = build(repo);

    await expect(svc.reorderDownloadAssets('o1', 'd1', ['a1', 'a9'])).rejects.toThrow(
      /does not match/i,
    );
    expect(repo.reorderDownloadAssets).not.toHaveBeenCalled();
  });

  it('rejects a reorder where a duplicate id masks an omitted one', async () => {
    const repo = makeRepo();
    vi.mocked(repo.listDownloadAssets).mockResolvedValue([
      makeDownloadAsset({ id: 'da1', assetId: 'a1', seq: 0 }),
      makeDownloadAsset({ id: 'da2', assetId: 'a2', seq: 1 }),
    ]);
    const { svc } = build(repo);

    await expect(svc.reorderDownloadAssets('o1', 'd1', ['a1', 'a1'])).rejects.toThrow(
      /does not match/i,
    );
    expect(repo.reorderDownloadAssets).not.toHaveBeenCalled();
  });

  it('accepts a reorder that is a permutation of the current set', async () => {
    const repo = makeRepo();
    const reordered = [
      makeDownloadAsset({ id: 'da2', assetId: 'a2', seq: 0 }),
      makeDownloadAsset({ id: 'da1', assetId: 'a1', seq: 1 }),
    ];
    vi.mocked(repo.listDownloadAssets).mockResolvedValue([
      makeDownloadAsset({ id: 'da1', assetId: 'a1', seq: 0 }),
      makeDownloadAsset({ id: 'da2', assetId: 'a2', seq: 1 }),
    ]);
    vi.mocked(repo.reorderDownloadAssets).mockResolvedValue(reordered);
    const { svc, appended } = build(repo);

    const result = await svc.reorderDownloadAssets('o1', 'd1', ['a2', 'a1']);

    expect(repo.reorderDownloadAssets).toHaveBeenCalledWith('o1', 'd1', ['a2', 'a1']);
    expect(result).toEqual(reordered);
    expect(appended).toEqual([
      {
        type: 'content.download.assets.reordered',
        version: 1,
        orgId: 'o1',
        data: { downloadId: 'd1', assets: reordered },
      },
    ]);
  });

  it('adds an asset and returns the ordered list', async () => {
    const repo = makeRepo();
    const list = [makeDownloadAsset()];
    vi.mocked(repo.addDownloadAsset).mockResolvedValue(list);
    const { svc, appended } = build(repo);

    const result = await svc.addDownloadAsset('o1', 'd1', { assetId: 'a1' });

    expect(repo.addDownloadAsset).toHaveBeenCalledWith('o1', 'd1', { assetId: 'a1' });
    expect(result).toEqual(list);
    expect(appended).toEqual([
      {
        type: 'content.download.asset.added',
        version: 1,
        orgId: 'o1',
        data: { downloadId: 'd1', assets: list },
      },
    ]);
  });

  it('removes an asset and appends the updated ordered list', async () => {
    const repo = makeRepo();
    const list = [makeDownloadAsset({ id: 'da2', assetId: 'a2' })];
    vi.mocked(repo.removeDownloadAsset).mockResolvedValue(list);
    const { svc, appended } = build(repo);

    const result = await svc.removeDownloadAsset('o1', 'd1', 'a1');

    expect(repo.removeDownloadAsset).toHaveBeenCalledWith('o1', 'd1', 'a1');
    expect(result).toEqual(list);
    expect(appended).toEqual([
      {
        type: 'content.download.asset.removed',
        version: 1,
        orgId: 'o1',
        data: { downloadId: 'd1', assets: list },
      },
    ]);
  });

  it('renames an asset and appends the updated ordered list', async () => {
    const repo = makeRepo();
    const list = [makeDownloadAsset({ displayName: 'Workbook' })];
    vi.mocked(repo.renameDownloadAsset).mockResolvedValue(list);
    const { svc, appended } = build(repo);

    const result = await svc.renameDownloadAsset('o1', 'd1', 'a1', 'Workbook');

    expect(repo.renameDownloadAsset).toHaveBeenCalledWith('o1', 'd1', 'a1', 'Workbook');
    expect(result).toEqual(list);
    expect(appended).toEqual([
      {
        type: 'content.download.asset.renamed',
        version: 1,
        orgId: 'o1',
        data: { downloadId: 'd1', assets: list },
      },
    ]);
  });
});

describe('contentEvents validation', () => {
  it('rejects a blank orgId', async () => {
    const { contentEvents } = await import('./events.js');
    expect(() => contentEvents.courseCreated.make({ orgId: '', data: makeCourse() })).toThrow(
      /orgId/,
    );
  });

  it('rejects a snapshot without an id', async () => {
    const { contentEvents } = await import('./events.js');
    expect(() =>
      contentEvents.moduleCreated.make({ orgId: 'org1', data: makeModule({ id: '' }) }),
    ).toThrow(/data\.id/);
  });

  it('rejects reorder events carrying blank ids', async () => {
    const { contentEvents } = await import('./events.js');
    expect(() =>
      contentEvents.modulesReordered.make({
        orgId: 'org1',
        data: [makeModule({ id: 'm1' }), makeModule({ id: '' })],
      }),
    ).toThrow(/data/);
  });

  it('rejects the old subject envelope field', async () => {
    const { contentEvents } = await import('./events.js');
    expect(() =>
      contentEvents.courseCreated.make({
        orgId: 'org1',
        subject: 'c1',
        data: makeCourse(),
      } as Parameters<typeof contentEvents.courseCreated.make>[0]),
    ).toThrow(/subject/);
  });

  it('rejects snapshot fields outside the content model', async () => {
    const { contentEvents } = await import('./events.js');
    expect(() =>
      contentEvents.courseCreated.make({
        orgId: 'org1',
        data: { ...makeCourse(), extraField: true },
      } as Parameters<typeof contentEvents.courseCreated.make>[0]),
    ).toThrow(/extraField/);
  });
});
