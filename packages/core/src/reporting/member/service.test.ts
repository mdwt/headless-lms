import { describe, it, expect } from 'vitest';
import { MemberReportServiceImpl, type MemberReportServiceParams } from './service.js';
import type { MemberReportRepository } from './index.js';
import type {
  Activity,
  ActivityView,
  ContentServicePort,
  Course,
  DownloadFile,
  Module,
} from '../../content/index.js';
import type { ProgressRecord, ProgressService } from '../../progress/index.js';
import { createFileUrls } from '../../assets/index.js';

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

function fakeRepo(): MemberReportRepository {
  return {
    directory: async () => ({ rows: [], total: 0, page: 1, pageSize: 20 }),
    spaceMemberCounts: async () => ({}),
    people: async () => [],
  };
}

function grantedAccess(grants: { orgId: string; contentId: string }[]) {
  return {
    ...deps.access,
    hasAccess: async (orgId: string, _s: string, contentId: string) =>
      grants.some((g) => g.orgId === orgId && g.contentId === contentId),
    listAccessibleContent: async (orgId: string) =>
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
    listCourseActivityViews: async (_org: string, courseId: string) =>
      (activities[courseId] ?? []).map((a) => ({ ...a, assetUrls: {} })),
  } as unknown as ContentServicePort;
}

const fileUrls = createFileUrls('https://api.test');
const files = { signFile: async (_orgId: string, assetId: string) => `https://signed/${assetId}` };

const readers: Pick<MemberReportServiceParams, 'notifications' | 'posts' | 'chats'> = {
  notifications: {
    listNotifications: async (_orgId, _userId, query) => ({
      rows: [],
      total: 0,
      page: query.page,
      pageSize: query.pageSize,
      unreadCount: 0,
    }),
  },
  posts: { visibleTitles: async () => ({}) },
  chats: { titlesFor: async () => ({}) },
};

const deps: Pick<
  MemberReportServiceParams,
  'files' | 'fileUrls' | 'access' | 'notifications' | 'posts' | 'chats'
> = {
  files,
  fileUrls,
  access: {
    isCommunityMember: async () => false,
    openSpaceIds: async () => [],
    spaceStandings: async () => ({}),
    hasAccess: async () => false,
    listAccessibleContent: async () => [],
  },
  ...readers,
};

// Full-surface ContentService fake: every member rejects or returns empty by
// default, overridable per test.
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
    listCourseActivityViews: async () => [],
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
    listCommunities: async () => ({ rows: [], total: 0, page: 1, pageSize: 20 }),
    getCommunity: async () => null,
    listPublishedCommunityIds: async () => [],
    listCommunitiesById: async () => [],
    createCommunity: rejectMutation,
    updateCommunity: rejectMutation,
    publishCommunity: rejectMutation,
    unpublishCommunity: rejectMutation,
    deleteCommunity: rejectMutation,
    patchDmSettings: rejectMutation,
    getSpace: async () => null,
    getCommunitySpace: async () => null,
    listSpaces: async () => [],
    getDmSettings: async () => null,
    createSpace: rejectMutation,
    updateSpace: rejectMutation,
    deleteSpace: rejectMutation,
    reorderSpaces: rejectMutation,
    setSpaceTopics: rejectMutation,
    addSpaceLink: rejectMutation,
    removeSpaceLink: rejectMutation,
    reorderSpaceLinks: rejectMutation,
    ...over,
  };
}

// Full-surface MemberReportRepository fake.
function fakeEntitlementReader(over: Partial<MemberReportRepository> = {}): MemberReportRepository {
  return {
    directory: async () => ({ rows: [], total: 0, page: 1, pageSize: 20 }),
    spaceMemberCounts: async () => ({}),
    people: async () => [],
    ...over,
  };
}

describe('MemberReportServiceImpl', () => {
  it('lists only published courses the student is enrolled in', async () => {
    const svc = new MemberReportServiceImpl({
      repo: fakeRepo(),
      content: fakeContent({ c1: course('c1', 'published'), c2: course('c2', 'draft') }, {}),
      progress: fakeProgress([]),
      ...deps,
      access: grantedAccess([
        { orgId: 'o1', contentId: 'c1' },
        { orgId: 'o1', contentId: 'c2' },
      ]),
    });
    const rows = await svc.listCourses('o1', 'stu_1');
    expect(rows.map((c) => c.id)).toEqual(['c1']);
  });

  it('returns null for a course the student is not enrolled in', async () => {
    const svc = new MemberReportServiceImpl({
      repo: fakeRepo(),
      content: fakeContent({ c1: course('c1') }, {}),
      progress: fakeProgress([]),
      ...deps,
      access: grantedAccess([{ orgId: 'o1', contentId: 'c1' }]),
    });
    expect(await svc.getCourse('o1', 'stu_1', 'cX')).toBeNull();
    expect(await svc.listModules('o1', 'stu_1', 'cX')).toBeNull();
  });

  it('does not return a course enrolled in another org', async () => {
    const svc = new MemberReportServiceImpl({
      repo: fakeRepo(),
      content: fakeContent({ c1: course('c1') }, {}),
      progress: fakeProgress([]),
      ...deps,
      access: grantedAccess([{ orgId: 'o2', contentId: 'c1' }]),
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

describe('MemberReportServiceImpl.courseProgress', () => {
  it('returns null when the student is not enrolled', async () => {
    const svc = new MemberReportServiceImpl({
      repo: fakeRepo(),
      content: fakeContent(
        { c1: course('c1') },
        { c1: progressModules },
        { c1: progressActivities },
      ),
      progress: fakeProgress([]),
      ...deps,
      access: grantedAccess([]),
    });
    expect(await svc.courseProgress('o1', 'stu_1', 'c1')).toBeNull();
  });

  it('maps records to statuses and derives percent from published activities only', async () => {
    const svc = new MemberReportServiceImpl({
      repo: fakeRepo(),
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
      ...deps,
      access: grantedAccess([{ orgId: 'o1', contentId: 'c1' }]),
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
    const svc = new MemberReportServiceImpl({
      repo: fakeRepo(),
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
      ...deps,
      access: grantedAccess([{ orgId: 'o1', contentId: 'c1' }]),
    });
    const view = await svc.courseProgress('o1', 'stu_1', 'c1');
    expect(view).toMatchObject({ percent: 100, completed: true });
  });

  it('includes stored positions keyed by activity, omitting recordless activities', async () => {
    const svc = new MemberReportServiceImpl({
      repo: fakeRepo(),
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
      ...deps,
      access: grantedAccess([{ orgId: 'o1', contentId: 'c1' }]),
    });
    const view = await svc.courseProgress('o1', 'stu_1', 'c1');
    expect(view?.positions).toEqual({
      a1: { vid_1: { seconds: 612, furthest: 700, duration: 1475 } },
    });
  });
});

describe('file URLs', () => {
  it('serves the published activity views of an enrolled course', async () => {
    const views: ActivityView[] = [
      { ...activity('a1', 0), assetUrls: { ast_video: 'https://signed/ast_video' } },
      { ...activity('a2', 1, { published: false }), assetUrls: {} },
    ];
    const svc = new MemberReportServiceImpl({
      repo: fakeEntitlementReader(),
      content: fakeContentService({
        getCourse: async () => ({ ...course('c1'), thumbnailUrl: null }),
        listCourseActivityViews: async () => views,
      }),
      progress: fakeProgress([]),
      ...deps,
      access: grantedAccess([{ orgId: 'o1', contentId: 'c1' }]),
    });

    expect(await svc.listActivities('o1', 'stu_1', 'c1')).toEqual([views[0]]);
  });

  it('returns no activities for a course the student is not enrolled in', async () => {
    const svc = new MemberReportServiceImpl({
      repo: fakeEntitlementReader(),
      content: fakeContentService(),
      progress: fakeProgress([]),
      ...deps,
    });

    expect(await svc.listActivities('o1', 'stu_1', 'c1')).toBeNull();
  });

  it('serves an entitled download with the files content signed', async () => {
    const download = { id: 'd1', status: 'published', thumbnailUrl: null } as never;
    const files: DownloadFile[] = [
      {
        orgId: 'o1',
        id: 'da1',
        downloadId: 'd1',
        assetId: 'a1',
        seq: 0,
        displayName: 'Chapter One',
        filename: 'Chapter One',
        contentType: 'application/pdf',
        size: 10,
        url: 'https://signed/a1',
        createdAt: AT,
        updatedAt: AT,
      },
    ];
    const svc = new MemberReportServiceImpl({
      repo: fakeEntitlementReader(),
      content: fakeContentService({
        getDownload: async () => download,
        listDownloadAssets: async () => files,
      }),
      progress: fakeProgress([]),
      ...deps,
      access: grantedAccess([{ orgId: 'o1', contentId: 'd1' }]),
    });

    expect(await svc.getDownload('o1', 'stu_1', 'd1')).toEqual({ download, assets: files });
  });

  it('serves no download the student is not entitled to', async () => {
    const svc = new MemberReportServiceImpl({
      repo: fakeEntitlementReader(),
      content: fakeContentService({ getDownload: async () => ({ status: 'published' }) as never }),
      progress: fakeProgress([]),
      ...deps,
    });

    expect(await svc.getDownload('o1', 'stu_1', 'd1')).toBeNull();
  });

  it('adds the signed photo URL to each directory entry', async () => {
    const row = {
      orgUserId: 'ou_sarah',
      userId: 'usr_sarah',
      role: 'student',
      displayName: 'Sarah',
      headline: null,
      bio: null,
    };
    const svc = new MemberReportServiceImpl({
      repo: fakeEntitlementReader({
        directory: async (_orgId, _communityId, query) => ({
          rows: [
            { ...row, imageAssetId: 'ast_photo' },
            { ...row, orgUserId: 'ou_james', userId: 'usr_james', imageAssetId: null },
          ],
          total: 2,
          page: query.page,
          pageSize: query.pageSize,
        }),
      }),
      content: fakeContentService({ getCommunity: async () => ({ id: 'cmy_1' }) as never }),
      progress: fakeProgress([]),
      files,
      fileUrls,
      access: {
        ...deps.access,
        isCommunityMember: async () => true,
        openSpaceIds: async () => [],
        spaceStandings: async () => ({}),
      },
      ...readers,
    });

    const entries = await svc.directory('o1', { id: 'ou_sarah', role: 'student' }, 'cmy_1', {
      page: 1,
      pageSize: 20,
    });

    expect(entries).toMatchObject({ total: 2, page: 1, pageSize: 20 });
    expect(entries?.rows.map((e) => [e.orgUserId, e.imageUrl])).toEqual([
      ['ou_sarah', fileUrls.personImage('ou_sarah')],
      ['ou_james', null],
    ]);
  });

  it('names what each notification refers to and leaves out what the viewer cannot see', async () => {
    const row = {
      orgId: 'o1',
      userId: 'usr_james',
      createdAt: AT,
      readAt: null,
      commentId: null,
      messageId: null,
    };
    const svc = new MemberReportServiceImpl({
      repo: fakeEntitlementReader({
        people: async () => [
          {
            orgUserId: 'ou_sarah',
            userId: 'usr_sarah',
            role: 'student',
            displayName: 'Sarah',
            headline: null,
            bio: null,
            imageAssetId: 'ast_photo',
          },
        ],
      }),
      content: fakeContentService({
        getCommunity: async () => ({ id: 'cmy_1', title: 'Founders' }) as never,
        getSpace: async () => ({ id: 'spc_1', name: 'Announcements' }) as never,
      }),
      progress: fakeProgress([]),
      ...deps,
      notifications: {
        listNotifications: async (_orgId, _userId, query) => ({
          rows: [
            {
              ...row,
              id: 'ntf_1',
              kind: 'newPostInSpace',
              actorOrgUserId: 'ou_sarah',
              communityId: 'cmy_1',
              spaceId: 'spc_1',
              postId: 'pst_seen',
              chatId: null,
            },
            {
              ...row,
              id: 'ntf_2',
              kind: 'newMessage',
              actorOrgUserId: 'ou_sarah',
              communityId: 'cmy_1',
              spaceId: null,
              postId: 'pst_hidden',
              chatId: 'cht_other',
            },
          ],
          total: 2,
          page: query.page,
          pageSize: query.pageSize,
          unreadCount: 2,
        }),
      },
      posts: { visibleTitles: async () => ({ pst_seen: 'Launch week' }) },
    });

    const view = await svc.notifications('o1', { id: 'ou_james', role: 'student' }, 'usr_james', {
      page: 1,
      pageSize: 20,
    });

    expect(view.unreadCount).toBe(2);
    expect(view.rows[0]).toMatchObject({
      actor: {
        orgUserId: 'ou_sarah',
        displayName: 'Sarah',
        imageUrl: fileUrls.personImage('ou_sarah'),
      },
      community: { id: 'cmy_1', title: 'Founders' },
      space: { id: 'spc_1', name: 'Announcements' },
      post: { id: 'pst_seen', title: 'Launch week' },
      chat: null,
    });
    expect(view.rows[1]).toMatchObject({ post: null, chat: null, space: null });
  });
});

describe('serving files', () => {
  const student = { id: 'stu_1', role: 'student' as const };
  const owner = { id: 'ou_owner', role: 'owner' as const };
  const link = (activityId: string, assetId: string) => ({
    orgId: 'o1',
    id: `aa_${activityId}_${assetId}`,
    activityId,
    assetId,
    seq: 0,
    createdAt: AT,
    updatedAt: AT,
  });
  const file = (assetId: string, displayName: string | null) => ({
    orgId: 'o1',
    id: `da_${assetId}`,
    downloadId: 'd1',
    assetId,
    seq: 0,
    displayName,
    filename: `${assetId}.pdf`,
    contentType: 'application/pdf',
    size: 10,
    url: fileUrls.downloadFile('d1', assetId),
    createdAt: AT,
    updatedAt: AT,
  });
  const build = (
    over: {
      grants?: { orgId: string; contentId: string }[];
      content?: Partial<ContentServicePort>;
      repo?: Partial<MemberReportRepository>;
    } = {},
  ) => {
    const signed: { assetId: string; saveAs?: string }[] = [];
    const svc = new MemberReportServiceImpl({
      repo: { ...fakeRepo(), ...over.repo },
      content: fakeContentService({
        getCourse: async (_o, id) => (id === 'c1' ? { ...course('c1'), thumbnailUrl: null } : null),
        getActivity: async (_o, id) => (id === 'a1' ? activity('a1', 0) : null),
        listCourseActivityAssets: async () => [link('a1', 'ast_video')],
        getDownload: async () =>
          ({ id: 'd1', status: 'published', thumbnailAssetId: 'ast_thumb' }) as never,
        listDownloadAssets: async () => [file('ast_pdf', 'Workbook.pdf'), file('ast_notes', null)],
        ...over.content,
      }),
      progress: fakeProgress([]),
      ...deps,
      files: {
        signFile: async (_o, assetId, opts) => {
          signed.push({ assetId, ...(opts?.saveAs ? { saveAs: opts.saveAs } : {}) });
          return `https://signed/${assetId}`;
        },
      },
      access: grantedAccess(
        over.grants ?? [
          { orgId: 'o1', contentId: 'c1' },
          { orgId: 'o1', contentId: 'd1' },
        ],
      ),
    });
    return { svc, signed };
  };

  it('serves a lesson file the activity links to a student who can open the course', async () => {
    const { svc, signed } = build();
    expect(await svc.activityFile('o1', student, 'a1', 'ast_video')).toBe(
      'https://signed/ast_video',
    );
    expect(signed).toEqual([{ assetId: 'ast_video' }]);
  });

  it('refuses a lesson file without access, unlinked, in a draft lesson or course, but lets staff through', async () => {
    expect(
      await build({ grants: [] }).svc.activityFile('o1', student, 'a1', 'ast_video'),
    ).toBeNull();
    expect(await build().svc.activityFile('o1', student, 'a1', 'ast_other')).toBeNull();
    const draftLesson = build({
      content: { getActivity: async () => activity('a1', 0, { published: false }) },
    });
    expect(await draftLesson.svc.activityFile('o1', student, 'a1', 'ast_video')).toBeNull();
    const draftCourse = build({
      content: { getCourse: async () => ({ ...course('c1', 'draft'), thumbnailUrl: null }) },
    });
    expect(await draftCourse.svc.activityFile('o1', student, 'a1', 'ast_video')).toBeNull();
    expect(await build({ grants: [] }).svc.activityFile('o1', owner, 'a1', 'ast_video')).toBe(
      'https://signed/ast_video',
    );
    expect(await build({ grants: [] }).svc.activityFile('o1', owner, 'a1', 'ast_other')).toBeNull();
  });

  it('serves a download file saved under its display name, or its filename', async () => {
    const { svc, signed } = build();
    expect(await svc.downloadFile('o1', student, 'd1', 'ast_pdf')).toBe('https://signed/ast_pdf');
    expect(await svc.downloadFile('o1', student, 'd1', 'ast_notes')).toBe(
      'https://signed/ast_notes',
    );
    expect(await svc.downloadFile('o1', student, 'd1', 'ast_missing')).toBeNull();
    expect(signed).toEqual([
      { assetId: 'ast_pdf', saveAs: 'Workbook.pdf' },
      { assetId: 'ast_notes', saveAs: 'ast_notes.pdf' },
    ]);
    expect(await build({ grants: [] }).svc.downloadFile('o1', student, 'd1', 'ast_pdf')).toBeNull();
  });

  it('serves the thumbnail of a published item to anyone, and of a draft only to staff', async () => {
    const { svc } = build({ grants: [] });
    expect(await svc.thumbnailFile('o1', student, 'download', 'd1')).toBe(
      'https://signed/ast_thumb',
    );
    const draft = build({
      content: {
        getCourse: async () =>
          ({
            ...course('c1', 'draft'),
            thumbnailAssetId: 'ast_cover',
            thumbnailUrl: null,
          }) as never,
      },
    });
    expect(await draft.svc.thumbnailFile('o1', student, 'course', 'c1')).toBeNull();
    expect(await draft.svc.thumbnailFile('o1', owner, 'course', 'c1')).toBe(
      'https://signed/ast_cover',
    );
    expect(await svc.thumbnailFile('o1', student, 'course', 'c1')).toBeNull();
  });

  it("serves an org user's photo only when it belongs to this org", async () => {
    const row = {
      orgUserId: 'ou_sarah',
      userId: 'usr_sarah',
      role: 'student',
      displayName: 'Sarah',
      headline: null,
      bio: null,
    };
    const withPhoto = build({
      repo: { people: async () => [{ ...row, imageAssetId: 'ast_photo' }] },
    });
    expect(await withPhoto.svc.personImage('o1', 'ou_sarah')).toBe('https://signed/ast_photo');
    const without = build({ repo: { people: async () => [{ ...row, imageAssetId: null }] } });
    expect(await without.svc.personImage('o1', 'ou_sarah')).toBeNull();
  });
});
