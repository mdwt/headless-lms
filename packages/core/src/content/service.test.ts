import { describe, it, expect, vi } from 'vitest';
import {
  ConflictError,
  ForbiddenError,
  InvalidInputError,
  NotFoundError,
} from '../shared/errors.js';
import type { Actor } from '../shared/actor.js';
import type { Community, SpaceDetail } from './model.js';
import { ContentService } from './service.js';
import { contentDeclarations } from './declarations.js';
import { contentEvents } from './events.js';
import type { ContentAssetReader, ContentRepository, ContentUnitOfWork } from './ports.js';
import type {
  Activity,
  Course,
  Download,
  DownloadAsset,
  Event,
  EventAsset,
  Module,
} from './model.js';
import type { NewDomainEvent, OutboxAppender } from '../shared/ports.js';
import type { AssetFiles } from '../assets/index.js';
import { actorWith } from '../organizations/index.js';
import { createFileUrls } from '../assets/index.js';
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
    listActivityAssetsForCourse: vi.fn().mockResolvedValue([]),
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
    listDownloadAssets: vi.fn().mockResolvedValue([]),
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
    listCommunities: vi.fn(),
    findCommunityById: vi.fn(),
    findCommunitiesByIds: vi.fn(),
    createCommunity: vi.fn(),
    updateCommunity: vi.fn(),
    patchCommunitySettings: vi.fn(),
    communitiesWithDigest: vi.fn(),
    deleteCommunity: vi.fn(),
    deleteCommunitySettings: vi.fn(),
    listSpaces: vi.fn(),
    findSpace: vi.fn(),
    lockSpace: vi.fn(),
    createSpace: vi.fn(),
    updateSpace: vi.fn(),
    deleteSpace: vi.fn(),
    reorderSpaces: vi.fn(),
    setSpaceTopics: vi.fn(),
    topicsInUse: vi.fn().mockResolvedValue([]),
    addSpaceLink: vi.fn(),
    removeSpaceLink: vi.fn(),
    reorderSpaceLinks: vi.fn(),
    spacesLinkingContent: vi.fn().mockResolvedValue([]),
    listEvents: vi.fn(),
    findEventById: vi.fn(),
    findEventsByIds: vi.fn(async () => []),
    createEvent: vi.fn(),
    updateEvent: vi.fn(),
    patchEventSettings: vi.fn(),
    deleteEvent: vi.fn(),
    deleteEventSettings: vi.fn(),
    listEventAssets: vi.fn().mockResolvedValue([]),
    listEventAssetsFor: vi.fn(async () => []),
    addEventAsset: vi.fn(),
    removeEventAsset: vi.fn(),
    renameEventAsset: vi.fn(),
    reorderEventAssets: vi.fn(),
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

function ownerIn(orgId: string): Actor {
  return actorWith({ owner: true, orgId, id: 'ou_owner' });
}

function library(ids: (id: string) => boolean = () => true, contentId: string | null = null) {
  return {
    libraryAssetsFor: vi.fn(async (_orgId: string, assetIds: string[]) =>
      assetIds.filter(ids).map((id) => ({ id, contentId })),
    ),
  };
}

const libraryAssets: ContentAssetReader = library();

const UNSIGNED = 'ast_unsigned';

const files: Pick<AssetFiles, 'readyFiles'> = {
  readyFiles: async (_orgId, ids) =>
    Object.fromEntries(
      ids
        .filter((id) => id !== UNSIGNED)
        .map((id) => [id, { filename: `${id}.pdf`, contentType: 'application/pdf', size: 100 }]),
    ),
};

const fileUrls = createFileUrls('https://api.test');

function fakeScheduler() {
  return {
    at: vi.fn(async (_job: string, _runAt: Date, _key: string, _payload: unknown) => {}),
    cancel: vi.fn(async (_job: string, _key: string) => {}),
  };
}

function build(repo = makeRepo(), assets: ContentAssetReader = libraryAssets) {
  const { uow, append, appended } = fakeUow(repo);
  const scheduler = fakeScheduler();
  const svc = new ContentService({
    repo,
    uow,
    libraryAssets: assets,
    files,
    fileUrls,
    scheduler,
  });
  return { svc, repo, append, appended, scheduler };
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
    const result = await svc.createCourse({ title: 'My New Course' }, ownerIn('org1'));

    expect(repo.createCourse).toHaveBeenCalledWith(
      'org1',
      { title: 'My New Course' },
      'my-new-course',
    );
    expect(result).toEqual({ ...created, thumbnailUrl: null });
  });

  it('delegates course reads to the content repository', async () => {
    const repo = makeRepo();
    const course = makeCourse();
    (repo.findCourseById as ReturnType<typeof vi.fn>).mockResolvedValue(course);

    const { svc, append } = build(repo);
    const result = await svc.getCourse('c1', ownerIn('org1'));

    expect(repo.findCourseById).toHaveBeenCalledWith('org1', 'c1');
    expect(result).toEqual({
      ...course,
      settings: { transcriptDownloads: false },
      thumbnailUrl: null,
    });
    expect(append).not.toHaveBeenCalled();
  });

  it('delegates a settings patch to the repository and returns its result', async () => {
    const repo = makeRepo();
    (repo.findCourseById as ReturnType<typeof vi.fn>).mockResolvedValue(makeCourse());
    (repo.patchCourseSettings as ReturnType<typeof vi.fn>).mockResolvedValue({
      transcriptDownloads: true,
    });

    const { svc } = build(repo);
    const result = await svc.patchCourseSettings(
      'c1',
      { transcriptDownloads: true },
      ownerIn('org1'),
    );

    expect(repo.patchCourseSettings).toHaveBeenCalledWith('org1', 'c1', {
      transcriptDownloads: true,
    });
    expect(result).toEqual({ transcriptDownloads: true });
  });

  it('throws NotFoundError when patching settings on a course that does not exist', async () => {
    const repo = makeRepo();
    (repo.findCourseById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const { svc } = build(repo);

    await expect(svc.patchCourseSettings('missing', {}, ownerIn('org1'))).rejects.toThrow(
      NotFoundError,
    );
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
    await svc.patchCourseSettings('c1', { transcriptDownloads: true }, ownerIn('org1'));

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
    await expect(svc.patchCourseSettings('missing', {}, ownerIn('org1'))).rejects.toThrow(
      NotFoundError,
    );
    expect(append).not.toHaveBeenCalled();
  });

  it('appends course.created (org + full snapshot) inside the unit of work', async () => {
    const repo = makeRepo();
    const created = makeCourse();
    (repo.createCourse as ReturnType<typeof vi.fn>).mockResolvedValue(created);

    const { svc, appended } = build(repo);
    await svc.createCourse({ title: 'Intro' }, ownerIn('org1'));

    expect(appended).toEqual([
      { type: 'content.course.created', version: 1, orgId: 'org1', data: created },
    ]);
  });

  it('appends course.updated with the updated snapshot', async () => {
    const repo = makeRepo();
    const updated = makeCourse({ title: 'Renamed' });
    (repo.updateCourse as ReturnType<typeof vi.fn>).mockResolvedValue(updated);

    const { svc, appended } = build(repo);
    const result = await svc.updateCourse('c1', { title: 'Renamed' }, ownerIn('org1'));

    expect(repo.updateCourse).toHaveBeenCalledWith('org1', 'c1', { title: 'Renamed' });
    expect(result).toEqual({ ...updated, thumbnailUrl: null });
    expect(appended).toEqual([
      { type: 'content.course.updated', version: 1, orgId: 'org1', data: updated },
    ]);
  });

  it('throws NotFoundError and appends nothing when update finds no course', async () => {
    const repo = makeRepo();
    (repo.updateCourse as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const { svc, append } = build(repo);
    await expect(svc.updateCourse('missing', { title: 'X' }, ownerIn('org1'))).rejects.toThrow(
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
    await svc.deleteCourse('c1', ownerIn('org1'));

    expect(appended).toEqual([
      { type: 'content.course.deleted', version: 1, orgId: 'org1', data: course },
    ]);
  });

  it('throws NotFoundError and appends nothing when remove finds no course', async () => {
    const repo = makeRepo();
    (repo.findCourseById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const { svc, repo: r, append } = build(repo);
    await expect(svc.deleteCourse('missing', ownerIn('org1'))).rejects.toThrow(NotFoundError);
    expect(r.deleteCourse).not.toHaveBeenCalled();
    expect(append).not.toHaveBeenCalled();
  });

  it('throws NotFoundError when the course vanishes between snapshot and delete', async () => {
    const repo = makeRepo();
    (repo.findCourseById as ReturnType<typeof vi.fn>).mockResolvedValue(makeCourse());
    (repo.deleteCourse as ReturnType<typeof vi.fn>).mockResolvedValue(false);

    const { svc, append } = build(repo);
    await expect(svc.deleteCourse('c1', ownerIn('org1'))).rejects.toThrow(NotFoundError);
    expect(append).not.toHaveBeenCalled();
  });

  it('does not append when the write fails — the error propagates out of run', async () => {
    const repo = makeRepo();
    (repo.createCourse as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('boom'));

    const { svc, append } = build(repo);
    await expect(svc.createCourse({ title: 'Intro' }, ownerIn('org1'))).rejects.toThrow('boom');
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
    const result = await svc.createModule('c1', 'New Module', ownerIn('org1'));

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
    await svc.updateModule('c1', 'm1', 'Renamed', ownerIn('org1'));

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
    await expect(svc.updateModule('c1', 'm1', 'Renamed', ownerIn('org1'))).rejects.toThrow(
      NotFoundError,
    );
    expect(repo.updateModule).not.toHaveBeenCalled();
    expect(append).not.toHaveBeenCalled();
  });

  it('appends course.module.deleted with the pre-delete snapshot', async () => {
    const repo = makeRepo();
    const module = makeModule();
    vi.mocked(repo.findModule).mockResolvedValue(module);
    vi.mocked(repo.deleteModule).mockResolvedValue([]);

    const { svc, appended } = build(repo);
    const result = await svc.deleteModule('c1', 'm1', ownerIn('org1'));

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
    await expect(svc.deleteModule('c1', 'missing', ownerIn('org1'))).rejects.toThrow(NotFoundError);
    expect(repo.deleteModule).not.toHaveBeenCalled();
    expect(append).not.toHaveBeenCalled();
  });

  it('appends course.modules.reordered with the resulting order', async () => {
    const repo = makeRepo();
    const reordered = [makeModule({ id: 'm2', seq: 0 }), makeModule({ id: 'm1', seq: 1 })];
    vi.mocked(repo.reorderModules).mockResolvedValue(reordered);

    const { svc, appended } = build(repo);
    const result = await svc.reorderModules('c1', ['m2', 'm1'], ownerIn('org1'));

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
    const result = await svc.saveActivity(
      'c1',
      'm1',
      { settings: { title: 'A' } },
      null,
      ownerIn('org1'),
    );

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
    await expect(svc.saveActivity('c1', 'missing', {}, null, ownerIn('org1'))).rejects.toThrow(
      NotFoundError,
    );
    expect(repo.saveActivity).not.toHaveBeenCalled();
    expect(append).not.toHaveBeenCalled();
  });

  it('appends course.activity.updated with the saved snapshot on update', async () => {
    const repo = makeRepo();
    const saved = makeActivity();
    vi.mocked(repo.findActivity).mockResolvedValue(makeActivity());
    vi.mocked(repo.saveActivity).mockResolvedValue({ modules: [makeModule()], activity: saved });

    const { svc, appended } = build(repo);
    await svc.saveActivity('c1', 'm1', { assetIds: ['a1'] }, 'act1', ownerIn('org1'));

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

  describe('content.course.activity.published', () => {
    const published = (activityId: string) => ({
      type: 'content.course.activity.published',
      version: 1,
      orgId: 'org1',
      data: { activityId, moduleId: 'm1', courseId: 'c1' },
    });

    function scenario(options: {
      status: 'draft' | 'published';
      before?: unknown;
      after: unknown;
    }) {
      const repo = makeRepo();
      vi.mocked(repo.findCourseById).mockResolvedValue(makeCourse({ status: options.status }));
      vi.mocked(repo.findModule).mockResolvedValue(makeModule());
      if (options.before !== undefined) {
        vi.mocked(repo.findActivity).mockResolvedValue(
          makeActivity({ settings: options.before as Activity['settings'] }),
        );
      }
      vi.mocked(repo.saveActivity).mockResolvedValue({
        modules: [makeModule()],
        activity: makeActivity({ settings: options.after as Activity['settings'] }),
      });
      return build(repo);
    }

    it('is emitted when an update publishes a draft activity of a published course', async () => {
      const { svc, appended } = scenario({
        status: 'published',
        before: { title: 'A', published: false },
        after: { title: 'A', published: true },
      });
      await svc.saveActivity('c1', 'm1', { settings: {} }, 'act1', ownerIn('org1'));
      expect(appended.map((event) => event.type)).toEqual([
        'content.course.activity.updated',
        'content.course.activity.published',
      ]);
      expect(appended[1]).toEqual(published('act1'));
    });

    it('is emitted when an activity is created published, a missing key counting as published', async () => {
      for (const after of [{ title: 'A', published: true }, { title: 'A' }, null]) {
        const { svc, appended } = scenario({ status: 'published', after });
        await svc.saveActivity('c1', 'm1', { settings: {} }, null, ownerIn('org1'));
        expect(appended).toEqual([
          expect.objectContaining({ type: 'content.course.activity.created' }),
          published('act1'),
        ]);
      }
    });

    it('is not emitted for a draft activity, an already published one, or a draft course', async () => {
      const cases = [
        { status: 'published' as const, after: { published: false } },
        { status: 'published' as const, before: { published: false }, after: { published: false } },
        { status: 'published' as const, before: { published: true }, after: { published: true } },
        { status: 'published' as const, before: {}, after: { published: true } },
        { status: 'published' as const, before: { published: true }, after: { published: false } },
        { status: 'draft' as const, before: { published: false }, after: { published: true } },
        { status: 'draft' as const, after: { published: true } },
      ];
      for (const options of cases) {
        const { svc, appended } = scenario(options);
        await svc.saveActivity(
          'c1',
          'm1',
          { settings: {} },
          options.before === undefined ? null : 'act1',
          ownerIn('org1'),
        );
        expect(appended).toHaveLength(1);
      }
    });
  });

  it('refuses activity assets that are not ready library files of the org', async () => {
    const repo = makeRepo();
    vi.mocked(repo.findActivity).mockResolvedValue(makeActivity());
    const { svc, append } = build(
      repo,
      library((id) => id === 'ast_lib'),
    );

    await expect(
      svc.saveActivity(
        'c1',
        'm1',
        { assetIds: ['ast_lib', 'ast_member', 'ast_gone'] },
        'act1',
        ownerIn('org1'),
      ),
    ).rejects.toThrow(
      'An activity can only use ready files from the media library. Not available: ast_member, ast_gone',
    );
    expect(repo.saveActivity).not.toHaveBeenCalled();
    expect(append).not.toHaveBeenCalled();
  });

  it('refuses a thumbnail or download file that is not a ready library file of the org', async () => {
    const repo = makeRepo();
    const { svc, append } = build(
      repo,
      library((id) => id === 'ast_lib'),
    );

    await expect(
      svc.updateCourse('c1', { thumbnailAssetId: 'ast_member' }, ownerIn('org1')),
    ).rejects.toThrow(
      'A course can only use ready files from the media library. Not available: ast_member',
    );
    await expect(
      svc.updateDownload('d1', { thumbnailAssetId: 'ast_member' }, ownerIn('org1')),
    ).rejects.toThrow('A download can only use ready files from the media library');
    await expect(
      svc.addDownloadAsset('d1', { assetId: 'ast_member' }, ownerIn('org1')),
    ).rejects.toThrow('A download can only use ready files from the media library');
    await expect(
      svc.updateCommunity('cmy1', { thumbnailAssetId: 'ast_member' }, ownerIn('org1')),
    ).rejects.toThrow('A community can only use ready files from the media library');
    expect(repo.updateCourse).not.toHaveBeenCalled();
    expect(repo.updateDownload).not.toHaveBeenCalled();
    expect(repo.addDownloadAsset).not.toHaveBeenCalled();
    expect(repo.updateCommunity).not.toHaveBeenCalled();
    expect(append).not.toHaveBeenCalled();
  });

  it('checks no file when a write clears the thumbnail or leaves it alone', async () => {
    const repo = makeRepo();
    const assets = library();
    vi.mocked(repo.updateCourse).mockResolvedValue(makeCourse());
    const { svc } = build(repo, assets);

    await svc.updateCourse('c1', { thumbnailAssetId: null }, ownerIn('org1'));
    await svc.updateCourse('c1', { title: 'Fundraising 101' }, ownerIn('org1'));

    expect(assets.libraryAssetsFor).not.toHaveBeenCalled();
  });

  it('throws NotFoundError when updating an activity that lives in another module', async () => {
    const repo = makeRepo();
    vi.mocked(repo.findActivity).mockResolvedValue(makeActivity({ moduleId: 'other' }));

    const { svc, append } = build(repo);
    await expect(svc.saveActivity('c1', 'm1', {}, 'act1', ownerIn('org1'))).rejects.toThrow(
      NotFoundError,
    );
    expect(repo.saveActivity).not.toHaveBeenCalled();
    expect(append).not.toHaveBeenCalled();
  });

  it('appends course.activity.deleted with the pre-delete snapshot', async () => {
    const repo = makeRepo();
    const activity = makeActivity();
    vi.mocked(repo.findActivity).mockResolvedValue(activity);
    vi.mocked(repo.deleteActivity).mockResolvedValue([makeModule()]);

    const { svc, appended } = build(repo);
    await svc.deleteActivity('c1', 'm1', 'act1', ownerIn('org1'));

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
    await expect(svc.deleteActivity('c1', 'm1', 'missing', ownerIn('org1'))).rejects.toThrow(
      NotFoundError,
    );
    expect(repo.deleteActivity).not.toHaveBeenCalled();
    expect(append).not.toHaveBeenCalled();
  });

  it('appends course.activities.reordered with the resulting order', async () => {
    const repo = makeRepo();
    const reordered = [makeModule()];
    vi.mocked(repo.reorderActivities).mockResolvedValue(reordered);

    const { svc, appended } = build(repo);
    const result = await svc.reorderActivities('c1', 'm1', ['act2', 'act1'], ownerIn('org1'));

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
    expect(await svc.getActivity('act1', ownerIn('o1'))).toEqual(activity);
    expect(await svc.getModule('m1', ownerIn('o1'))).toEqual(module);
    expect(repo.findActivity).toHaveBeenCalledWith('o1', 'act1');
    expect(repo.findModule).toHaveBeenCalledWith('o1', 'm1');
  });

  it('resolve unknown ids to null', async () => {
    const repo = makeRepo();
    vi.mocked(repo.findActivity).mockResolvedValue(null);
    vi.mocked(repo.findModule).mockResolvedValue(null);
    const { svc } = build(repo);
    expect(await svc.getActivity('nope', ownerIn('o1'))).toBeNull();
    expect(await svc.getModule('nope', ownerIn('o1'))).toBeNull();
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
      libraryAssets,
      files,
      fileUrls,
      scheduler: fakeScheduler(),
      logger,
    });

    await svc.createCourse({ title: 'Intro' }, ownerIn('org-1'));
    await svc.updateCourse(course.id, { title: 'Intro 2' }, ownerIn('org-1'));
    await svc.deleteCourse(course.id, ownerIn('org-1'));

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
      libraryAssets,
      files,
      fileUrls,
      scheduler: fakeScheduler(),
      logger,
    });

    await svc.createModule('c1', 'Module 1', ownerIn('org-1'));
    await svc.deleteActivity('c1', 'm1', 'act1', ownerIn('org-1'));

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
      libraryAssets,
      files,
      fileUrls,
      scheduler: fakeScheduler(),
      logger,
    });

    await expect(svc.deleteModule('c1', 'missing', ownerIn('org-1'))).rejects.toThrow(
      NotFoundError,
    );

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
    const result = await svc.createDownload({ title: 'My Great Workbook' }, ownerIn('o1'));

    expect(repo.createDownload).toHaveBeenCalledWith(
      'o1',
      { title: 'My Great Workbook' },
      'my-great-workbook',
    );
    expect(result).toEqual({ ...download, thumbnailUrl: null });
    expect(appended).toEqual([
      { type: 'content.download.created', version: 1, orgId: 'o1', data: download },
    ]);
  });

  it('throws NotFoundError when updating a download that does not exist', async () => {
    const repo = makeRepo();
    vi.mocked(repo.updateDownload).mockResolvedValue(null);

    const { svc } = build(repo);

    await expect(svc.updateDownload('missing', { title: 'x' }, ownerIn('o1'))).rejects.toThrow(
      NotFoundError,
    );
  });

  it('appends download.deleted carrying the pre-delete snapshot', async () => {
    const repo = makeRepo();
    const download = makeDownload();
    vi.mocked(repo.getDownload).mockResolvedValue(download);
    vi.mocked(repo.deleteDownload).mockResolvedValue(true);

    const { svc, appended } = build(repo);
    await svc.removeDownload('d1', ownerIn('o1'));

    expect(appended).toEqual([
      { type: 'content.download.deleted', version: 1, orgId: 'o1', data: download },
    ]);
  });

  it('throws NotFoundError when deleting a download that does not exist', async () => {
    const repo = makeRepo();
    vi.mocked(repo.getDownload).mockResolvedValue(null);

    const { svc } = build(repo);

    await expect(svc.removeDownload('missing', ownerIn('o1'))).rejects.toThrow(NotFoundError);
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

function asFile(link: DownloadAsset) {
  return {
    ...link,
    filename: `${link.assetId}.pdf`,
    contentType: 'application/pdf',
    size: 100,
    url: fileUrls.downloadFile(link.downloadId, link.assetId),
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
    await expect(svc.reorderDownloadAssets('d1', ['a1'], ownerIn('o1'))).rejects.toThrow(
      /does not match/i,
    );
    expect(repo.reorderDownloadAssets).not.toHaveBeenCalled();
  });

  it('rejects a reorder containing an id not in the download', async () => {
    const repo = makeRepo();
    vi.mocked(repo.listDownloadAssets).mockResolvedValue([
      makeDownloadAsset({ id: 'da1', assetId: 'a1', seq: 0 }),
    ]);
    const { svc } = build(repo);

    await expect(svc.reorderDownloadAssets('d1', ['a1', 'a9'], ownerIn('o1'))).rejects.toThrow(
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

    await expect(svc.reorderDownloadAssets('d1', ['a1', 'a1'], ownerIn('o1'))).rejects.toThrow(
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

    const result = await svc.reorderDownloadAssets('d1', ['a2', 'a1'], ownerIn('o1'));

    expect(repo.reorderDownloadAssets).toHaveBeenCalledWith('o1', 'd1', ['a2', 'a1']);
    expect(result).toEqual(reordered.map(asFile));
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

    const result = await svc.addDownloadAsset('d1', { assetId: 'a1' }, ownerIn('o1'));

    expect(repo.addDownloadAsset).toHaveBeenCalledWith('o1', 'd1', { assetId: 'a1' });
    expect(result).toEqual(list.map(asFile));
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

    const result = await svc.removeDownloadAsset('d1', 'a1', ownerIn('o1'));

    expect(repo.removeDownloadAsset).toHaveBeenCalledWith('o1', 'd1', 'a1');
    expect(result).toEqual(list.map(asFile));
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

    const result = await svc.renameDownloadAsset('d1', 'a1', 'Workbook', ownerIn('o1'));

    expect(repo.renameDownloadAsset).toHaveBeenCalledWith('o1', 'd1', 'a1', 'Workbook');
    expect(result).toEqual(list.map(asFile));
    expect(result[0]?.filename).toBe('a1.pdf');
    expect(result[0]?.url).toBe(fileUrls.downloadFile('d1', 'a1'));
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

function makeCommunity(over: Partial<Community> = {}): Community {
  return {
    orgId: 'org1',
    id: 'cmy_1',
    type: 'community',
    title: 'Makers',
    slug: 'makers',
    description: '',
    status: 'draft',
    thumbnailAssetId: null,
    settings: {
      dm: {
        enabled: true,
        memberToMember: true,
        memberToTeam: true,
        teamToAnyone: true,
        firstMessageIsRequest: true,
        groupChats: true,
        groupSize: 8,
      },
      digest: null,
    },
    createdAt: AT,
    updatedAt: AT,
    ...over,
  };
}

describe('communities', () => {
  it('creates a community and records the actor', async () => {
    const repo = makeRepo();
    const community = makeCommunity();
    vi.mocked(repo.createCommunity).mockResolvedValue(community);
    const { svc, appended } = build(repo);

    const result = await svc.createCommunity({ title: 'Makers' }, ownerIn('org1'));

    expect(repo.createCommunity).toHaveBeenCalledWith('org1', { title: 'Makers' }, 'makers');
    expect(result).toEqual({ ...community, thumbnailUrl: null });
    expect(appended).toEqual([
      {
        type: 'content.community.created',
        version: 1,
        orgId: 'org1',
        data: community,
        metadata: { actorId: 'ou_owner' },
      },
    ]);
  });

  it('refuses an instructor', async () => {
    const repo = makeRepo();
    const { svc } = build(repo);
    await expect(
      svc.createCommunity(
        { title: 'Makers' },
        actorWith({ orgId: 'org1', content: { crs_1: ['courses:write'] } }),
      ),
    ).rejects.toThrow(ForbiddenError);
    expect(repo.createCommunity).not.toHaveBeenCalled();
  });

  it('deletes the settings row with the community', async () => {
    const repo = makeRepo();
    const community = makeCommunity();
    vi.mocked(repo.findCommunityById).mockResolvedValue(community);
    vi.mocked(repo.deleteCommunity).mockResolvedValue(true);
    const { svc, appended } = build(repo);

    await svc.deleteCommunity(community.id, ownerIn('org1'));

    expect(repo.deleteCommunitySettings).toHaveBeenCalledWith('org1', community.id);
    expect(appended[0]).toMatchObject({
      type: 'content.community.deleted',
      metadata: { actorId: 'ou_owner' },
    });
  });

  it('stores a digest schedule beside the direct-message settings, for an owner or admin only', async () => {
    const repo = makeRepo();
    const digest = {
      cadence: 'weekly' as const,
      weekday: 4,
      hour: 7,
      timeZone: 'Europe/Madrid',
    };
    const community = makeCommunity({ settings: { ...makeCommunity().settings, digest } });
    vi.mocked(repo.patchCommunitySettings).mockResolvedValue(community);
    const { svc, appended } = build(repo);

    await expect(
      svc.patchCommunitySettings(community.id, { digest, groupSize: 6 }, ownerIn('org1')),
    ).resolves.toMatchObject({ settings: { digest } });
    expect(repo.patchCommunitySettings).toHaveBeenCalledWith('org1', community.id, {
      digest,
      groupSize: 6,
    });
    expect(appended[0]).toMatchObject({
      type: 'content.community.updated',
      data: { settings: { digest } },
    });
    await expect(
      svc.patchCommunitySettings(
        community.id,
        { digest: null },
        actorWith({ orgId: 'org1', content: { crs_1: ['courses:write'] } }),
      ),
    ).rejects.toThrow(ForbiddenError);
  });

  it('reads every published community with a digest schedule through the repository', async () => {
    const repo = makeRepo();
    const rows = [
      {
        orgId: 'org1',
        communityId: 'cmy_1',
        digest: { cadence: 'daily' as const, weekday: 0, hour: 7, timeZone: 'UTC' },
      },
    ];
    vi.mocked(repo.communitiesWithDigest).mockResolvedValue(rows);
    const { svc } = build(repo);

    await expect(svc.communitiesWithDigest()).resolves.toEqual(rows);
  });

  it('reads many communities in one repository call and asks nothing for none', async () => {
    const repo = makeRepo();
    const community = makeCommunity();
    vi.mocked(repo.findCommunitiesByIds).mockResolvedValue([community]);
    const { svc } = build(repo);

    await expect(svc.listCommunitiesById([community.id], ownerIn('org1'))).resolves.toEqual([
      community,
    ]);
    expect(repo.findCommunitiesByIds).toHaveBeenCalledWith('org1', [community.id]);
    await expect(svc.listCommunitiesById([], ownerIn('org1'))).resolves.toEqual([]);
    expect(repo.findCommunitiesByIds).toHaveBeenCalledTimes(1);
  });

  it('strips settings from the public data of community created, updated and deleted', () => {
    const community = makeCommunity();
    const { settings: _settings, ...expected } = community;
    for (const event of [
      contentEvents.communityCreated,
      contentEvents.communityUpdated,
      contentEvents.communityDeleted,
    ]) {
      const parsed = event.publicData.safeParse(community);
      expect(parsed.success).toBe(true);
      expect(parsed.data).toEqual(expected);
    }
  });
});

const SPACE_AT = new Date('2026-01-01T00:00:00.000Z');

function makeSpace(over: Partial<SpaceDetail> = {}): SpaceDetail {
  return {
    orgId: 'org1',
    id: 'spc_1',
    communityId: 'cmy_1',
    name: 'General',
    description: '',
    seq: 0,
    accessRule: 'all_members',
    capacity: null,
    settings: { comments: true, reactions: true, requireReview: false },
    createdAt: SPACE_AT,
    updatedAt: SPACE_AT,
    topics: [
      {
        orgId: 'org1',
        id: 'top_a',
        spaceId: 'spc_1',
        name: 'Wins',
        seq: 0,
        createdAt: SPACE_AT,
        updatedAt: SPACE_AT,
      },
      {
        orgId: 'org1',
        id: 'top_b',
        spaceId: 'spc_1',
        name: 'Help',
        seq: 1,
        createdAt: SPACE_AT,
        updatedAt: SPACE_AT,
      },
    ],
    links: [],
    ...over,
  };
}

describe('spaces', () => {
  it('reads a space of the community and hides a space of another community', async () => {
    const repo = makeRepo();
    vi.mocked(repo.findSpace).mockResolvedValue(makeSpace());
    const { svc } = build(repo);

    await expect(svc.getCommunitySpace('cmy_1', 'spc_1', ownerIn('org1'))).resolves.toEqual(
      makeSpace(),
    );
    await expect(svc.getCommunitySpace('cmy_other', 'spc_1', ownerIn('org1'))).rejects.toThrow(
      NotFoundError,
    );
  });

  it('writes the topics inside the unit of work under the space lock', async () => {
    const repo = makeRepo();
    const space = makeSpace();
    vi.mocked(repo.findSpace).mockResolvedValue(space);
    const calls: string[] = [];
    const uow: ContentUnitOfWork = {
      run: async (fn) => {
        calls.push('begin');
        const result = await fn({
          content: repo,
          outbox: { append: vi.fn(async () => undefined) },
        });
        calls.push('commit');
        return result;
      },
    };
    vi.mocked(repo.lockSpace).mockImplementation(async () => {
      calls.push('lock');
      return space;
    });
    vi.mocked(repo.setSpaceTopics).mockImplementation(async () => {
      calls.push('write');
      return space;
    });
    const svc = new ContentService({
      repo: makeRepo(),
      uow,
      libraryAssets,
      files,
      fileUrls,
      scheduler: fakeScheduler(),
    });
    const input = {
      topics: [
        { id: 'top_b', name: 'Wins' },
        { id: 'top_a', name: 'Help' },
      ],
    };

    await svc.setSpaceTopics('cmy_1', 'spc_1', input, ownerIn('org1'));

    expect(calls).toEqual(['begin', 'lock', 'write', 'commit']);
    expect(repo.setSpaceTopics).toHaveBeenCalledWith('org1', 'spc_1', input);
  });

  it('refuses to remove a topic a post uses and writes nothing', async () => {
    const repo = makeRepo();
    const space = makeSpace();
    vi.mocked(repo.lockSpace).mockResolvedValue(space);
    vi.mocked(repo.findSpace).mockResolvedValue(space);
    vi.mocked(repo.topicsInUse).mockResolvedValue(['top_b']);
    const { svc, append } = build(repo);

    await expect(
      svc.setSpaceTopics(
        'cmy_1',
        'spc_1',
        { topics: [{ id: 'top_a', name: 'Wins' }] },
        ownerIn('org1'),
      ),
    ).rejects.toThrow(ConflictError);
    expect(repo.topicsInUse).toHaveBeenCalledWith('org1', 'spc_1', ['top_b']);
    expect(repo.setSpaceTopics).not.toHaveBeenCalled();
    expect(append).not.toHaveBeenCalled();
  });

  it('removes a topic no post uses', async () => {
    const repo = makeRepo();
    const space = makeSpace();
    vi.mocked(repo.lockSpace).mockResolvedValue(space);
    vi.mocked(repo.findSpace).mockResolvedValue(space);
    vi.mocked(repo.setSpaceTopics).mockResolvedValue(makeSpace({ topics: [space.topics[0]!] }));
    const { svc, appended } = build(repo);

    await svc.setSpaceTopics(
      'cmy_1',
      'spc_1',
      { topics: [{ id: 'top_a', name: 'Wins' }] },
      ownerIn('org1'),
    );

    expect(repo.topicsInUse).toHaveBeenCalledWith('org1', 'spc_1', ['top_b']);
    expect(appended[0]).toMatchObject({ type: 'content.community.space.updated' });
  });

  it('refuses topics for a space of another community', async () => {
    const repo = makeRepo();
    vi.mocked(repo.lockSpace).mockResolvedValue(makeSpace());
    const { svc } = build(repo);

    await expect(
      svc.setSpaceTopics('cmy_other', 'spc_1', { topics: [] }, ownerIn('org1')),
    ).rejects.toThrow(NotFoundError);
    expect(repo.setSpaceTopics).not.toHaveBeenCalled();
  });

  it('records the actor on the space update a deleted course causes', async () => {
    const repo = makeRepo();
    vi.mocked(repo.findCourseById).mockResolvedValue(makeCourse());
    vi.mocked(repo.deleteCourse).mockResolvedValue(true);
    vi.mocked(repo.spacesLinkingContent).mockResolvedValue(['spc_1']);
    vi.mocked(repo.findSpace).mockResolvedValue(makeSpace());
    const { svc, appended } = build(repo);

    await svc.deleteCourse('c1', ownerIn('org1'));

    expect(appended[1]).toMatchObject({
      type: 'content.community.space.updated',
      metadata: { actorId: 'ou_owner' },
    });
  });

  it('records the actor on the space update a deleted download causes', async () => {
    const repo = makeRepo();
    vi.mocked(repo.getDownload).mockResolvedValue(makeDownload());
    vi.mocked(repo.deleteDownload).mockResolvedValue(true);
    vi.mocked(repo.spacesLinkingContent).mockResolvedValue(['spc_1']);
    vi.mocked(repo.findSpace).mockResolvedValue(makeSpace());
    const { svc, appended } = build(repo);

    await svc.removeDownload('d1', ownerIn('o1'));

    expect(appended[1]).toMatchObject({
      type: 'content.community.space.updated',
      metadata: { actorId: 'ou_owner' },
    });
  });

  it('records the actor on the space update a deleted community causes', async () => {
    const repo = makeRepo();
    vi.mocked(repo.findCommunityById).mockResolvedValue(makeCommunity());
    vi.mocked(repo.deleteCommunity).mockResolvedValue(true);
    vi.mocked(repo.spacesLinkingContent).mockResolvedValue(['spc_1']);
    vi.mocked(repo.findSpace).mockResolvedValue(makeSpace());
    const { svc, appended } = build(repo);

    await svc.deleteCommunity('cmy_1', ownerIn('org1'));

    expect(appended[1]).toMatchObject({
      type: 'content.community.space.updated',
      metadata: { actorId: 'ou_owner' },
    });
  });
});

describe('file URLs', () => {
  it('carries the thumbnail URL on course, download and community reads and writes', async () => {
    const repo = makeRepo();
    const course = makeCourse({ thumbnailAssetId: 'ast_cover' });
    const download = makeDownload({ thumbnailAssetId: 'ast_dl' });
    const community = makeCommunity({ thumbnailAssetId: 'ast_cmy' });
    vi.mocked(repo.findCourseById).mockResolvedValue(course);
    vi.mocked(repo.listCourses).mockResolvedValue({
      rows: [course, makeCourse({ id: 'c2' })],
      total: 2,
      page: 1,
      pageSize: 20,
    });
    vi.mocked(repo.updateCourse).mockResolvedValue(course);
    vi.mocked(repo.getDownload).mockResolvedValue(download);
    vi.mocked(repo.updateDownload).mockResolvedValue(download);
    vi.mocked(repo.findCommunityById).mockResolvedValue(community);
    vi.mocked(repo.updateCommunity).mockResolvedValue(community);
    const { svc } = build(repo);

    expect((await svc.getCourse('c1', ownerIn('org1')))?.thumbnailUrl).toBe(
      fileUrls.thumbnail('course', course.id),
    );
    expect(
      (await svc.listCourses({ page: 1, pageSize: 20 }, ownerIn('org1'))).rows.map(
        (c) => c.thumbnailUrl,
      ),
    ).toEqual([fileUrls.thumbnail('course', course.id), null]);
    expect((await svc.updateCourse('c1', { title: 'x' }, ownerIn('org1'))).thumbnailUrl).toBe(
      fileUrls.thumbnail('course', course.id),
    );
    expect((await svc.getDownload('d1', ownerIn('o1')))?.thumbnailUrl).toBe(
      fileUrls.thumbnail('download', download.id),
    );
    expect((await svc.updateDownload('d1', { title: 'x' }, ownerIn('o1'))).thumbnailUrl).toBe(
      fileUrls.thumbnail('download', download.id),
    );
    expect((await svc.getCommunity('cmy_1', ownerIn('org1')))?.thumbnailUrl).toBe(
      fileUrls.thumbnail('community', community.id),
    );
    expect((await svc.updateCommunity('cmy_1', { title: 'x' }, ownerIn('org1'))).thumbnailUrl).toBe(
      fileUrls.thumbnail('community', community.id),
    );
  });

  it('leaves the thumbnail URL empty when there is no thumbnail', async () => {
    const repo = makeRepo();
    vi.mocked(repo.findCourseById).mockResolvedValue(makeCourse({ thumbnailAssetId: null }));
    const { svc } = build(repo);

    expect((await svc.getCourse('c1', ownerIn('org1')))?.thumbnailUrl).toBeNull();
  });

  it('gives each activity the URLs of its own linked files only', async () => {
    const repo = makeRepo();
    vi.mocked(repo.listActivitiesForCourse).mockResolvedValue([
      makeActivity({ id: 'act1' }),
      makeActivity({ id: 'act2', seq: 1 }),
      makeActivity({ id: 'act3', seq: 2 }),
    ]);
    vi.mocked(repo.listActivityAssetsForCourse).mockResolvedValue([
      {
        orgId: 'org1',
        id: 'aca1',
        activityId: 'act1',
        assetId: 'ast_video',
        seq: 0,
        createdAt: AT,
        updatedAt: AT,
      },
      {
        orgId: 'org1',
        id: 'aca2',
        activityId: 'act1',
        assetId: 'ast_image',
        seq: 1,
        createdAt: AT,
        updatedAt: AT,
      },
      {
        orgId: 'org1',
        id: 'aca3',
        activityId: 'act2',
        assetId: 'ast_pdf',
        seq: 0,
        createdAt: AT,
        updatedAt: AT,
      },
      {
        orgId: 'org1',
        id: 'aca4',
        activityId: 'act2',
        assetId: UNSIGNED,
        seq: 1,
        createdAt: AT,
        updatedAt: AT,
      },
    ]);
    const { svc } = build(repo);

    const views = await svc.listCourseActivityViews('c1', ownerIn('org1'));

    expect(views.map((view) => [view.id, view.assetUrls])).toEqual([
      [
        'act1',
        {
          ast_video: fileUrls.activityAsset('act1', 'ast_video'),
          ast_image: fileUrls.activityAsset('act1', 'ast_image'),
        },
      ],
      [
        'act2',
        {
          ast_pdf: fileUrls.activityAsset('act2', 'ast_pdf'),
          [UNSIGNED]: fileUrls.activityAsset('act2', UNSIGNED),
        },
      ],
      ['act3', {}],
    ]);
  });

  it('gives download files their stable URL and drops a file that is not ready', async () => {
    const repo = makeRepo();
    vi.mocked(repo.listDownloadAssets).mockResolvedValue([
      makeDownloadAsset({ id: 'da1', assetId: 'a1', displayName: 'Workbook.pdf' }),
      makeDownloadAsset({ id: 'da2', assetId: 'a2', seq: 1 }),
      makeDownloadAsset({ id: 'da3', assetId: UNSIGNED, seq: 2 }),
    ]);
    const { svc } = build(repo);

    const files = await svc.listDownloadAssets('d1', ownerIn('o1'));

    expect(
      files.map((file) => [file.id, file.filename, file.contentType, file.size, file.url]),
    ).toEqual([
      ['da1', 'a1.pdf', 'application/pdf', 100, fileUrls.downloadFile('d1', 'a1')],
      ['da2', 'a2.pdf', 'application/pdf', 100, fileUrls.downloadFile('d1', 'a2')],
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

const JAMES = actorWith({
  id: 'ou_james',
  orgId: 'org1',
  content: { crs_1: ['courses:read', 'courses:write', 'courses:moderate', 'progress:read'] },
});

describe('permissions', () => {
  it('refuses every permission-declared method to an actor who holds nothing', async () => {
    const repo = makeRepo();
    vi.mocked(repo.findActivity).mockResolvedValue(makeActivity({ courseId: 'crs_x' }));
    vi.mocked(repo.findModule).mockResolvedValue(makeModule({ courseId: 'crs_x' }));
    vi.mocked(repo.findSpace).mockResolvedValue({ communityId: 'cmy_x' } as SpaceDetail);
    const { svc, append } = build(repo);
    const nobody = actorWith({ orgId: 'org1' });
    const methods = Object.entries(contentDeclarations).filter(
      ([, declaration]) => typeof declaration !== 'string',
    );
    expect(methods.length).toBeGreaterThan(0);
    for (const [name] of methods) {
      const method = (svc as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>)[
        name
      ]!;
      const args = Array.from({ length: Math.max(method.length - 1, 0) }, () => 'crs_x');
      await expect(method.call(svc, ...args, nobody), name).rejects.toThrow(ForbiddenError);
    }
    expect(append).not.toHaveBeenCalled();
  });

  it('lets an Instructor on one course list only that course', async () => {
    const repo = makeRepo();
    vi.mocked(repo.listCourses).mockResolvedValue({ rows: [], total: 0, page: 1, pageSize: 20 });
    const { svc } = build(repo);

    await svc.listCourses({ page: 1, pageSize: 20 }, JAMES);
    await svc.listCourses({ page: 1, pageSize: 20 }, ownerIn('org1'));

    expect(vi.mocked(repo.listCourses).mock.calls).toEqual([
      ['org1', { page: 1, pageSize: 20 }, ['crs_1']],
      ['org1', { page: 1, pageSize: 20 }, undefined],
    ]);
  });

  it('refuses an Instructor on one course deleting any course, creating one or editing bundles', async () => {
    const repo = makeRepo();
    const { svc } = build(repo);

    await expect(svc.deleteCourse('crs_2', JAMES)).rejects.toThrow(ForbiddenError);
    await expect(svc.deleteCourse('crs_1', JAMES)).rejects.toThrow(ForbiddenError);
    await expect(svc.createCourse({ title: 'New' }, JAMES)).rejects.toThrow(ForbiddenError);
    await expect(svc.createBundle({ name: 'All' }, JAMES)).rejects.toThrow(ForbiddenError);
    await expect(svc.updateBundle('bnd_1', { name: 'All' }, JAMES)).rejects.toThrow(ForbiddenError);
    await expect(svc.addBundleItem('bnd_1', 'crs_1', JAMES)).rejects.toThrow(ForbiddenError);
    await expect(svc.listCommunities({ page: 1, pageSize: 20 }, JAMES)).rejects.toThrow(
      ForbiddenError,
    );
    expect(repo.deleteCourse).not.toHaveBeenCalled();
    expect(repo.createBundle).not.toHaveBeenCalled();
  });

  it('deletes a course with courses:delete on it and refuses another course', async () => {
    const repo = makeRepo();
    vi.mocked(repo.findCourseById).mockResolvedValue(makeCourse({ id: 'crs_1' }));
    vi.mocked(repo.deleteCourse).mockResolvedValue(true);
    const { svc } = build(repo);
    const deleter = actorWith({ orgId: 'org1', content: { crs_1: ['courses:delete'] } });

    await svc.deleteCourse('crs_1', deleter);
    await expect(svc.deleteCourse('crs_2', deleter)).rejects.toThrow(ForbiddenError);
    expect(repo.deleteCourse).toHaveBeenCalledTimes(1);
  });

  it('lets an Instructor edit lessons and delete modules of their course only', async () => {
    const repo = makeRepo();
    vi.mocked(repo.findActivity).mockResolvedValue(makeActivity({ courseId: 'crs_1' }));
    vi.mocked(repo.findModule).mockResolvedValue(makeModule({ courseId: 'crs_1' }));
    vi.mocked(repo.saveActivity).mockResolvedValue({
      modules: [],
      activity: makeActivity({ courseId: 'crs_1' }),
    });
    vi.mocked(repo.deleteModule).mockResolvedValue([]);
    const { svc } = build(repo);

    await svc.saveActivity('crs_1', 'm1', { settings: {} }, 'act1', JAMES);
    await svc.deleteModule('crs_1', 'm1', JAMES);
    await expect(svc.saveActivity('crs_2', 'm1', { settings: {} }, 'act1', JAMES)).rejects.toThrow(
      ForbiddenError,
    );
    await expect(svc.deleteModule('crs_2', 'm1', JAMES)).rejects.toThrow(ForbiddenError);
    expect(repo.saveActivity).toHaveBeenCalledTimes(1);
  });

  it("re-saves a lesson that already holds an Admin's library file without media:read", async () => {
    const repo = makeRepo();
    vi.mocked(repo.findActivity).mockResolvedValue(makeActivity({ courseId: 'crs_1' }));
    vi.mocked(repo.listActivityAssetsForCourse).mockResolvedValue([
      { orgId: 'org1', activityId: 'act1', assetId: 'ast_admin' },
    ] as Awaited<ReturnType<ContentRepository['listActivityAssetsForCourse']>>);
    vi.mocked(repo.saveActivity).mockResolvedValue({
      modules: [],
      activity: makeActivity({ courseId: 'crs_1' }),
    });
    const assets = library();
    const { svc } = build(repo, assets);

    await svc.saveActivity('crs_1', 'm1', { assetIds: ['ast_admin'] }, 'act1', JAMES);

    expect(assets.libraryAssetsFor).not.toHaveBeenCalled();
    expect(repo.saveActivity).toHaveBeenCalledTimes(1);
  });

  it('attaches only files uploaded for the course unless the actor holds media:read', async () => {
    const repo = makeRepo();
    vi.mocked(repo.findActivity).mockResolvedValue(makeActivity({ courseId: 'crs_1' }));
    vi.mocked(repo.saveActivity).mockResolvedValue({
      modules: [],
      activity: makeActivity({ courseId: 'crs_1' }),
    });
    const assets = {
      libraryAssetsFor: vi.fn(async (_orgId: string, ids: string[]) =>
        ids.map((id) => ({ id, contentId: id === 'ast_own' ? 'crs_1' : null })),
      ),
    };
    const { svc } = build(repo, assets);
    const librarian = actorWith({
      orgId: 'org1',
      org: ['media:read'],
      content: { crs_1: ['courses:write'] },
    });

    await svc.saveActivity('crs_1', 'm1', { assetIds: ['ast_own'] }, 'act1', JAMES);
    await expect(
      svc.saveActivity('crs_1', 'm1', { assetIds: ['ast_own', 'ast_library'] }, 'act1', JAMES),
    ).rejects.toThrow(ForbiddenError);
    await svc.saveActivity('crs_1', 'm1', { assetIds: ['ast_library'] }, 'act1', librarian);

    expect(repo.saveActivity).toHaveBeenCalledTimes(2);
  });

  it('checks a thumbnail against the item it is set on', async () => {
    const repo = makeRepo();
    vi.mocked(repo.updateDownload).mockResolvedValue(makeDownload({ id: 'dl_1' }));
    const assets = library(() => true, 'dl_1');
    const { svc } = build(repo, assets);
    const editor = actorWith({ orgId: 'org1', content: { dl_1: ['downloads:write'] } });

    await svc.updateDownload('dl_1', { thumbnailAssetId: 'ast_cover' }, editor);
    await expect(svc.addDownloadAsset('dl_2', { assetId: 'ast_cover' }, editor)).rejects.toThrow(
      ForbiddenError,
    );
    expect(repo.updateDownload).toHaveBeenCalledTimes(1);
    expect(repo.addDownloadAsset).not.toHaveBeenCalled();
  });

  it('configures a community with communities:write on it and refuses another', async () => {
    const repo = makeRepo();
    vi.mocked(repo.updateCommunity).mockResolvedValue(makeCommunity({ id: 'cmy_1' }));
    const { svc } = build(repo);
    const host = actorWith({ orgId: 'org1', content: { cmy_1: ['communities:write'] } });

    await svc.updateCommunity('cmy_1', { title: 'Spring' }, host);
    await expect(svc.updateCommunity('cmy_2', { title: 'Autumn' }, host)).rejects.toThrow(
      ForbiddenError,
    );
    await expect(svc.deleteCommunity('cmy_1', host)).rejects.toThrow(ForbiddenError);
    await expect(svc.createCommunity({ title: 'New' }, host)).rejects.toThrow(ForbiddenError);
  });
});

describe('a moderator reads the community', () => {
  const MODERATOR = actorWith({
    orgId: 'org1',
    id: 'ou_emma',
    content: { cmy_1: ['communities:moderate'] },
  });

  it('refuses the community, its spaces and the list without communities:read or communities:moderate', async () => {
    const repo = makeRepo();
    const { svc } = build(repo);
    const nobody = actorWith({ orgId: 'org1' });

    await expect(svc.getCommunity('cmy_1', nobody)).rejects.toThrow(ForbiddenError);
    await expect(svc.listSpaces('cmy_1', nobody)).rejects.toThrow(ForbiddenError);
    await expect(svc.listCommunities({ page: 1, pageSize: 20 }, nobody)).rejects.toThrow(
      ForbiddenError,
    );
    expect(repo.findCommunityById).not.toHaveBeenCalled();
    expect(repo.listCommunities).not.toHaveBeenCalled();
  });

  it('reads the community and its spaces with communities:moderate on it', async () => {
    const repo = makeRepo();
    vi.mocked(repo.findCommunityById).mockResolvedValue(makeCommunity({ id: 'cmy_1' }));
    vi.mocked(repo.listSpaces).mockResolvedValue([]);
    const { svc } = build(repo);

    await expect(svc.getCommunity('cmy_1', MODERATOR)).resolves.toMatchObject({ id: 'cmy_1' });
    await expect(svc.listSpaces('cmy_1', MODERATOR)).resolves.toEqual([]);
  });

  it('refuses another community to a moderator of one', async () => {
    const repo = makeRepo();
    const { svc } = build(repo);

    await expect(svc.getCommunity('cmy_2', MODERATOR)).rejects.toThrow(ForbiddenError);
    await expect(svc.listSpaces('cmy_2', MODERATOR)).rejects.toThrow(ForbiddenError);
    await expect(svc.updateCommunity('cmy_1', { title: 'Spring' }, MODERATOR)).rejects.toThrow(
      ForbiddenError,
    );
    expect(repo.findCommunityById).not.toHaveBeenCalled();
  });

  it('lists the union of the communities a person reads and moderates', async () => {
    const repo = makeRepo();
    vi.mocked(repo.listCommunities).mockResolvedValue({
      rows: [],
      total: 0,
      page: 1,
      pageSize: 20,
    });
    const { svc } = build(repo);
    const both = actorWith({
      orgId: 'org1',
      content: { cmy_1: ['communities:moderate'], cmy_2: ['communities:read'] },
    });
    const moderatesOnOrg = actorWith({
      orgId: 'org1',
      org: ['communities:moderate'],
      content: { cmy_2: ['communities:read'] },
    });

    await svc.listCommunities({ page: 1, pageSize: 20 }, MODERATOR);
    await svc.listCommunities({ page: 1, pageSize: 20 }, both);
    await svc.listCommunities({ page: 1, pageSize: 20 }, moderatesOnOrg);

    expect(vi.mocked(repo.listCommunities).mock.calls.map((call) => call[2])).toEqual([
      ['cmy_1'],
      ['cmy_2', 'cmy_1'],
      undefined,
    ]);
  });
});

describe('item reads', () => {
  it('throws NotFoundError for a missing course, download, bundle or community', async () => {
    const repo = makeRepo();
    vi.mocked(repo.findCourseById).mockResolvedValue(null);
    vi.mocked(repo.getDownload).mockResolvedValue(null);
    vi.mocked(repo.findBundleById).mockResolvedValue(null);
    vi.mocked(repo.findCommunityById).mockResolvedValue(null);
    const { svc } = build(repo);
    const owner = ownerIn('org1');

    await expect(svc.getCourse('crs_x', owner)).rejects.toThrow(NotFoundError);
    await expect(svc.getDownload('dl_x', owner)).rejects.toThrow(NotFoundError);
    await expect(svc.getBundle('bnd_x', owner)).rejects.toThrow(NotFoundError);
    await expect(svc.getCommunity('cmy_x', owner)).rejects.toThrow(NotFoundError);
  });

  it('answers null for a missing item on the find reads', async () => {
    const repo = makeRepo();
    vi.mocked(repo.findCourseById).mockResolvedValue(null);
    vi.mocked(repo.getDownload).mockResolvedValue(null);
    vi.mocked(repo.findBundleById).mockResolvedValue(null);
    vi.mocked(repo.findCommunityById).mockResolvedValue(null);
    const { svc } = build(repo);
    const owner = ownerIn('org1');

    await expect(svc.findCourse('crs_x', owner)).resolves.toBeNull();
    await expect(svc.findDownload('dl_x', owner)).resolves.toBeNull();
    await expect(svc.findBundle('bnd_x', owner)).resolves.toBeNull();
    await expect(svc.findCommunity('cmy_x', owner)).resolves.toBeNull();
  });
});

const HOUR = 60 * 60 * 1000;

function makeEvent(over: Partial<Event> = {}): Event {
  return {
    orgId: 'o1',
    id: 'evn_1',
    type: 'event',
    title: 'Conversation practice',
    description: '',
    thumbnailAssetId: null,
    status: 'draft',
    startsAt: new Date(Date.now() + 72 * HOUR),
    endsAt: new Date(Date.now() + 73 * HOUR),
    timeZone: 'Europe/London',
    location: { venue: null, online: { url: 'https://zoom.us/j/123', details: null } },
    recording: null,
    settings: { type: 'public', capacity: null, notifications: true, replay: true },
    createdAt: AT,
    updatedAt: AT,
    ...over,
  };
}

function updatesEventTo(repo: ContentRepository, previous: Event, next: Event) {
  vi.mocked(repo.findEventById).mockResolvedValue(previous);
  vi.mocked(repo.updateEvent).mockResolvedValue(next);
}

describe('events', () => {
  const tom = actorWith({ id: 'ou_tom', orgId: 'o1', org: ['events:write'] });

  it('creates a draft event with its settings and appends content.event.created', async () => {
    const repo = makeRepo();
    const event = makeEvent();
    vi.mocked(repo.createEvent).mockResolvedValue(event);
    vi.mocked(repo.patchEventSettings).mockResolvedValue({ ...event.settings, capacity: 20 });
    const { svc, appended, scheduler } = build(repo);

    const input = {
      title: event.title,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      timeZone: event.timeZone,
      settings: { capacity: 20 },
    };
    const result = await svc.createEvent(input, tom);

    const { settings: _settings, ...fields } = input;
    expect(repo.createEvent).toHaveBeenCalledWith('o1', fields);
    expect(repo.patchEventSettings).toHaveBeenCalledWith('o1', 'evn_1', { capacity: 20 });
    const created = { ...event, settings: { ...event.settings, capacity: 20 } };
    expect(result).toEqual({ ...created, thumbnailUrl: null });
    expect(appended).toEqual([
      {
        type: 'content.event.created',
        version: 1,
        orgId: 'o1',
        data: created,
        metadata: { actorId: 'ou_tom' },
      },
    ]);
    expect(scheduler.at).not.toHaveBeenCalled();
  });

  it('refuses to create an event without events:write on the org', async () => {
    const repo = makeRepo();
    const { svc } = build(repo);
    const onOne = actorWith({ orgId: 'o1', content: { evn_1: ['events:write'] } });
    const input = {
      title: 'x',
      startsAt: new Date(),
      endsAt: new Date(Date.now() + HOUR),
      timeZone: 'UTC',
    };

    await expect(svc.createEvent(input, onOne)).rejects.toThrow(ForbiddenError);
    expect(repo.createEvent).not.toHaveBeenCalled();
  });

  it('refuses an event that ends before it starts', async () => {
    const repo = makeRepo();
    const { svc } = build(repo);
    const startsAt = new Date();

    await expect(
      svc.createEvent({ title: 'x', startsAt, endsAt: startsAt, timeZone: 'UTC' }, tom),
    ).rejects.toThrow(InvalidInputError);
    vi.mocked(repo.findEventById).mockResolvedValue(makeEvent());
    await expect(
      svc.updateEvent('evn_1', { endsAt: new Date(Date.now() - HOUR) }, tom),
    ).rejects.toThrow(InvalidInputError);
    expect(repo.createEvent).not.toHaveBeenCalled();
    expect(repo.updateEvent).not.toHaveBeenCalled();
  });

  it('publishes an event, carries the previous values and schedules both notices', async () => {
    const repo = makeRepo();
    const previous = makeEvent();
    const published = makeEvent({ status: 'published' });
    updatesEventTo(repo, previous, published);
    const { svc, appended, scheduler } = build(repo);

    await svc.updateEvent('evn_1', { status: 'published' }, tom);

    expect(repo.updateEvent).toHaveBeenCalledWith('o1', 'evn_1', { status: 'published' });
    expect(appended).toEqual([
      {
        type: 'content.event.updated',
        version: 1,
        orgId: 'o1',
        data: published,
        metadata: {
          actorId: 'ou_tom',
          previousStatus: 'draft',
          previousType: 'public',
          previousStartsAt: previous.startsAt.toISOString(),
          previousEndsAt: previous.endsAt.toISOString(),
          locationChanged: false,
        },
      },
    ]);
    expect(scheduler.at.mock.calls).toEqual([
      [
        'content.events.starting_soon',
        new Date(published.startsAt.getTime() - 24 * HOUR),
        'evn_1:1d',
        { orgId: 'o1', eventId: 'evn_1', lead: '1d' },
      ],
      [
        'content.events.starting_soon',
        new Date(published.startsAt.getTime() - HOUR),
        'evn_1:1h',
        { orgId: 'o1', eventId: 'evn_1', lead: '1h' },
      ],
    ]);
    expect(scheduler.cancel).not.toHaveBeenCalled();
  });

  it('cancels a notice whose time has passed when the event moves', async () => {
    const repo = makeRepo();
    const previous = makeEvent({ status: 'published' });
    const startsAt = new Date(Date.now() + 3 * HOUR);
    const moved = makeEvent({
      status: 'published',
      startsAt,
      endsAt: new Date(startsAt.getTime() + HOUR),
    });
    updatesEventTo(repo, previous, moved);
    const { svc, scheduler, appended } = build(repo);

    await svc.updateEvent('evn_1', { startsAt, endsAt: moved.endsAt }, tom);

    expect(scheduler.cancel.mock.calls).toEqual([['content.events.starting_soon', 'evn_1:1d']]);
    expect(scheduler.at.mock.calls).toEqual([
      [
        'content.events.starting_soon',
        new Date(startsAt.getTime() - HOUR),
        'evn_1:1h',
        { orgId: 'o1', eventId: 'evn_1', lead: '1h' },
      ],
    ]);
    expect(appended[0]?.metadata).toMatchObject({
      previousStatus: 'published',
      previousStartsAt: previous.startsAt.toISOString(),
    });
  });

  it('leaves the notices alone when a published event changes but its start does not', async () => {
    const repo = makeRepo();
    const previous = makeEvent({ status: 'published' });
    updatesEventTo(repo, previous, { ...previous, title: 'Renamed' });
    const { svc, scheduler } = build(repo);

    await svc.updateEvent('evn_1', { title: 'Renamed' }, tom);

    expect(scheduler.at).not.toHaveBeenCalled();
    expect(scheduler.cancel).not.toHaveBeenCalled();
  });

  it('cancels both notices on unpublish', async () => {
    const repo = makeRepo();
    const previous = makeEvent({ status: 'published' });
    updatesEventTo(repo, previous, { ...previous, status: 'draft' });
    const { svc, scheduler } = build(repo);

    await svc.updateEvent('evn_1', { status: 'draft' }, tom);

    expect(scheduler.cancel.mock.calls).toEqual([
      ['content.events.starting_soon', 'evn_1:1d'],
      ['content.events.starting_soon', 'evn_1:1h'],
    ]);
    expect(scheduler.at).not.toHaveBeenCalled();
  });

  it('marks a changed location and patches the settings in the same update', async () => {
    const repo = makeRepo();
    const previous = makeEvent();
    const location = {
      venue: { name: 'The library', address: null },
      online: previous.location.online,
    };
    updatesEventTo(repo, previous, { ...previous, location });
    vi.mocked(repo.patchEventSettings).mockResolvedValue({
      ...previous.settings,
      type: 'private',
    });
    const { svc, appended } = build(repo);

    const result = await svc.updateEvent('evn_1', { location, settings: { type: 'private' } }, tom);

    expect(repo.updateEvent).toHaveBeenCalledWith('o1', 'evn_1', { location });
    expect(repo.patchEventSettings).toHaveBeenCalledWith('o1', 'evn_1', { type: 'private' });
    expect(result.settings.type).toBe('private');
    expect(appended[0]?.metadata).toMatchObject({ previousType: 'public', locationChanged: true });
  });

  it('refuses to change a canceled event with 409 canceled', async () => {
    const repo = makeRepo();
    vi.mocked(repo.findEventById).mockResolvedValue(makeEvent({ status: 'canceled' }));
    const { svc } = build(repo);

    const refused = svc.updateEvent('evn_1', { status: 'published' }, tom);

    await expect(refused).rejects.toThrow(ConflictError);
    await expect(refused).rejects.toMatchObject({ code: 'canceled' });
    expect(repo.updateEvent).not.toHaveBeenCalled();
  });

  it('needs events:write on the event to update it', async () => {
    const repo = makeRepo();
    const { svc } = build(repo);
    const reader = actorWith({ orgId: 'o1', content: { evn_1: ['events:read'] } });

    await expect(svc.updateEvent('evn_1', { title: 'x' }, reader)).rejects.toThrow(ForbiddenError);
    const host = actorWith({ id: 'ou_host', orgId: 'o1', content: { evn_1: ['events:write'] } });
    const previous = makeEvent();
    updatesEventTo(repo, previous, { ...previous, title: 'x' });
    await expect(svc.updateEvent('evn_1', { title: 'x' }, host)).resolves.toMatchObject({
      title: 'x',
    });
  });

  it('cancels an event, tells automations and drops its notices', async () => {
    const repo = makeRepo();
    const previous = makeEvent({ status: 'published' });
    const canceled = { ...previous, status: 'canceled' as const };
    updatesEventTo(repo, previous, canceled);
    const { svc, appended, scheduler } = build(repo);

    await expect(svc.cancelEvent('evn_1', tom)).resolves.toEqual({
      ...canceled,
      thumbnailUrl: null,
    });

    expect(repo.updateEvent).toHaveBeenCalledWith('o1', 'evn_1', { status: 'canceled' });
    expect(appended).toEqual([
      expect.objectContaining({
        type: 'content.event.updated',
        data: canceled,
        metadata: expect.objectContaining({ actorId: 'ou_tom', previousStatus: 'published' }),
      }),
    ]);
    expect(scheduler.cancel.mock.calls).toEqual([
      ['content.events.starting_soon', 'evn_1:1d'],
      ['content.events.starting_soon', 'evn_1:1h'],
    ]);
  });

  it('refuses to cancel an event twice', async () => {
    const repo = makeRepo();
    vi.mocked(repo.findEventById).mockResolvedValue(makeEvent({ status: 'canceled' }));
    const { svc, appended } = build(repo);

    await expect(svc.cancelEvent('evn_1', tom)).rejects.toMatchObject({ code: 'canceled' });
    expect(appended).toEqual([]);
  });

  it('deletes an event with events:delete, purges its settings and drops its notices', async () => {
    const repo = makeRepo();
    const event = makeEvent({ status: 'published' });
    vi.mocked(repo.findEventById).mockResolvedValue(event);
    vi.mocked(repo.deleteEvent).mockResolvedValue(true);
    const { svc, appended, scheduler } = build(repo);

    await expect(svc.deleteEvent('evn_1', tom)).rejects.toThrow(ForbiddenError);
    const sarah = actorWith({ id: 'ou_sarah', orgId: 'o1', org: ['events:delete'] });
    await svc.deleteEvent('evn_1', sarah);

    expect(repo.deleteEvent).toHaveBeenCalledWith('o1', 'evn_1');
    expect(repo.deleteEventSettings).toHaveBeenCalledWith('o1', 'evn_1');
    expect(appended).toEqual([
      {
        type: 'content.event.deleted',
        version: 1,
        orgId: 'o1',
        data: event,
        metadata: { actorId: 'ou_sarah' },
      },
    ]);
    expect(scheduler.cancel).toHaveBeenCalledTimes(2);
  });

  it('throws NotFoundError for an event that does not exist', async () => {
    const repo = makeRepo();
    vi.mocked(repo.findEventById).mockResolvedValue(null);
    const { svc } = build(repo);

    await expect(svc.getEvent('evn_x', tom)).rejects.toThrow(NotFoundError);
    await expect(svc.updateEvent('evn_x', { title: 'x' }, tom)).rejects.toThrow(NotFoundError);
    await expect(svc.cancelEvent('evn_x', tom)).rejects.toThrow(NotFoundError);
    await expect(svc.deleteEvent('evn_x', ownerIn('o1'))).rejects.toThrow(NotFoundError);
    await expect(svc.listEventAssets('evn_x', tom)).rejects.toThrow(NotFoundError);
  });

  it('lists every event to a holder on the org and only their events otherwise', async () => {
    const repo = makeRepo();
    const page = { rows: [makeEvent()], total: 1, page: 1, pageSize: 20 };
    vi.mocked(repo.listEvents).mockResolvedValue(page);
    const { svc } = build(repo);
    const query = { page: 1, pageSize: 20 };

    await svc.listEvents(query, tom);
    await svc.listEvents(query, actorWith({ orgId: 'o1', content: { evn_1: ['events:read'] } }));

    expect(vi.mocked(repo.listEvents).mock.calls).toEqual([
      ['o1', query, undefined],
      ['o1', query, ['evn_1']],
    ]);
    await expect(svc.listEvents(query, actorWith({ orgId: 'o1' }))).rejects.toThrow(ForbiddenError);
  });

  it('leaves the location and recording out of the public data', () => {
    const event = makeEvent({ recording: { url: 'https://video.test/1', details: null } });
    const shown = contentEvents.eventUpdated.publicData.parse(event);

    expect(shown).not.toHaveProperty('location');
    expect(shown).not.toHaveProperty('recording');
    expect(shown).toMatchObject({ id: 'evn_1', settings: event.settings });
  });
});

describe('event starting soon', () => {
  it('appends content.event.starting_soon when the notice is due', async () => {
    const repo = makeRepo();
    const event = makeEvent({ status: 'published' });
    vi.mocked(repo.findEventById).mockResolvedValue(event);
    const { svc, appended, scheduler } = build(repo);

    await svc.startingSoon('o1', 'evn_1', '1h', new Date(event.startsAt.getTime() - HOUR));

    expect(appended).toEqual([
      {
        type: 'content.event.starting_soon',
        version: 1,
        orgId: 'o1',
        data: { eventId: 'evn_1', lead: '1h', startsAt: event.startsAt },
      },
    ]);
    expect(scheduler.at).not.toHaveBeenCalled();
  });

  it('schedules itself again when it fires before the notice is due', async () => {
    const repo = makeRepo();
    const event = makeEvent({ status: 'published' });
    vi.mocked(repo.findEventById).mockResolvedValue(event);
    const { svc, appended, scheduler } = build(repo);

    await svc.startingSoon('o1', 'evn_1', '1d', new Date(event.startsAt.getTime() - 30 * HOUR));

    expect(appended).toEqual([]);
    expect(scheduler.at).toHaveBeenCalledWith(
      'content.events.starting_soon',
      new Date(event.startsAt.getTime() - 24 * HOUR),
      'evn_1:1d',
      { orgId: 'o1', eventId: 'evn_1', lead: '1d' },
    );
  });

  it('skips an event that is no longer published', async () => {
    const repo = makeRepo();
    const { svc, appended, scheduler } = build(repo);

    for (const found of [null, makeEvent({ status: 'draft' }), makeEvent({ status: 'canceled' })]) {
      vi.mocked(repo.findEventById).mockResolvedValue(found);
      await svc.startingSoon('o1', 'evn_1', '1h', new Date());
    }

    expect(appended).toEqual([]);
    expect(scheduler.at).not.toHaveBeenCalled();
  });
});

function makeEventAsset(over: Partial<EventAsset> = {}): EventAsset {
  return {
    orgId: 'o1',
    id: 'eva_1',
    eventId: 'evn_1',
    assetId: 'a1',
    seq: 0,
    displayName: null,
    createdAt: AT,
    updatedAt: AT,
    ...over,
  };
}

describe('event assets', () => {
  const tom = actorWith({ id: 'ou_tom', orgId: 'o1', content: { evn_1: ['events:write'] } });

  it('lists the files in order with their event file urls', async () => {
    const repo = makeRepo();
    vi.mocked(repo.findEventById).mockResolvedValue(makeEvent());
    vi.mocked(repo.listEventAssets).mockResolvedValue([
      makeEventAsset({ assetId: 'a1' }),
      makeEventAsset({ id: 'eva_2', assetId: UNSIGNED, seq: 1 }),
    ]);
    const { svc } = build(repo);

    await expect(svc.listEventAssets('evn_1', tom)).resolves.toEqual([
      {
        ...makeEventAsset({ assetId: 'a1' }),
        filename: 'a1.pdf',
        contentType: 'application/pdf',
        size: 100,
        url: 'https://api.test/api/member/events/evn_1/assets/a1',
      },
    ]);
  });

  it('answers 404 for a file on an event that does not exist, before checking the file', async () => {
    const repo = makeRepo();
    const { svc } = build(
      repo,
      library(() => false, null),
    );

    await expect(svc.addEventAsset('evn_1', { assetId: 'a1' }, tom)).rejects.toThrow(NotFoundError);
    await expect(svc.updateEvent('evn_1', { thumbnailAssetId: 'a1' }, tom)).rejects.toThrow(
      NotFoundError,
    );
    expect(repo.addEventAsset).not.toHaveBeenCalled();
  });

  it('adds a file uploaded for the event, and refuses another without media:read', async () => {
    const repo = makeRepo();
    vi.mocked(repo.findEventById).mockResolvedValue(makeEvent());
    vi.mocked(repo.addEventAsset).mockResolvedValue([makeEventAsset()]);
    const { svc } = build(
      repo,
      library(() => true, 'evn_1'),
    );

    await svc.addEventAsset('evn_1', { assetId: 'a1' }, tom);
    expect(repo.addEventAsset).toHaveBeenCalledWith('o1', 'evn_1', { assetId: 'a1' });

    const other = build(
      repo,
      library(() => true, 'evn_other'),
    ).svc;
    await expect(other.addEventAsset('evn_1', { assetId: 'a2' }, tom)).rejects.toThrow(
      ForbiddenError,
    );
  });

  it('rejects a reorder whose ids are not exactly the current set', async () => {
    const repo = makeRepo();
    vi.mocked(repo.listEventAssets).mockResolvedValue([
      makeEventAsset({ assetId: 'a1' }),
      makeEventAsset({ id: 'eva_2', assetId: 'a2', seq: 1 }),
    ]);
    const { svc } = build(repo);

    await expect(svc.reorderEventAssets('evn_1', ['a1', 'a1'], tom)).rejects.toThrow(ConflictError);
    expect(repo.reorderEventAssets).not.toHaveBeenCalled();

    vi.mocked(repo.reorderEventAssets).mockResolvedValue([]);
    await svc.reorderEventAssets('evn_1', ['a2', 'a1'], tom);
    expect(repo.reorderEventAssets).toHaveBeenCalledWith('o1', 'evn_1', ['a2', 'a1']);
  });

  it('needs events:write to rename or remove a file', async () => {
    const repo = makeRepo();
    const { svc } = build(repo);
    const reader = actorWith({ orgId: 'o1', content: { evn_1: ['events:read'] } });

    await expect(svc.renameEventAsset('evn_1', 'a1', 'Slides', reader)).rejects.toThrow(
      ForbiddenError,
    );
    await expect(svc.removeEventAsset('evn_1', 'a1', reader)).rejects.toThrow(ForbiddenError);
    vi.mocked(repo.renameEventAsset).mockResolvedValue([]);
    vi.mocked(repo.removeEventAsset).mockResolvedValue([]);
    await svc.renameEventAsset('evn_1', 'a1', 'Slides', tom);
    await svc.removeEventAsset('evn_1', 'a1', tom);
    expect(repo.renameEventAsset).toHaveBeenCalledWith('o1', 'evn_1', 'a1', 'Slides');
    expect(repo.removeEventAsset).toHaveBeenCalledWith('o1', 'evn_1', 'a1');
  });
});
