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
import type { AssetUrlSigner } from '../../assets/index.js';

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
    directory: async () => [],
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

const assetUrls: AssetUrlSigner = {
  urls: async (_orgId, ids) => Object.fromEntries(ids.map((id) => [id, `https://signed/${id}`])),
  downloads: async () => ({}),
};

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
  'assetUrls' | 'access' | 'notifications' | 'posts' | 'chats'
> = {
  assetUrls,
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
    directory: async () => [],
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

describe('signed file URLs', () => {
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
        directory: async () => [
          { ...row, imageAssetId: 'ast_photo' },
          { ...row, orgUserId: 'ou_james', userId: 'usr_james', imageAssetId: null },
        ],
      }),
      content: fakeContentService({ getCommunity: async () => ({ id: 'cmy_1' }) as never }),
      progress: fakeProgress([]),
      assetUrls,
      access: {
        ...deps.access,
        isCommunityMember: async () => true,
        openSpaceIds: async () => [],
        spaceStandings: async () => ({}),
      },
      ...readers,
    });

    const entries = await svc.directory('o1', { id: 'ou_sarah', role: 'student' }, 'cmy_1');

    expect(entries?.map((e) => [e.orgUserId, e.imageUrl])).toEqual([
      ['ou_sarah', 'https://signed/ast_photo'],
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
      actor: { orgUserId: 'ou_sarah', displayName: 'Sarah', imageUrl: 'https://signed/ast_photo' },
      community: { id: 'cmy_1', title: 'Founders' },
      space: { id: 'spc_1', name: 'Announcements' },
      post: { id: 'pst_seen', title: 'Launch week' },
      chat: null,
    });
    expect(view.rows[1]).toMatchObject({ post: null, chat: null, space: null });
  });
});
