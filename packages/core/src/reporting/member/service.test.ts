import { describe, it, expect, vi } from 'vitest';
import { MemberReportServiceImpl, type MemberReportServiceParams } from './service.js';
import type { MemberReportRepository } from './index.js';
import type {
  Activity,
  ActivityView,
  ContentServicePort,
  Course,
  DownloadFile,
  Module,
  SpaceDetail,
  SpaceView,
} from '../../content/index.js';
import type { SpaceMember } from '../../entitlements/index.js';
import type { ProgressRecord, ProgressService } from '../../progress/index.js';
import { createFileUrls } from '../../assets/index.js';
import { actorWith } from '../../organizations/index.js';
import { NotFoundError } from '../../shared/errors.js';
import type { Actor } from '../../shared/actor.js';

const SYSTEM: Actor = actorWith({ id: 'system', orgId: 'o1', owner: true });
const stu: Actor = actorWith({ id: 'stu_1', orgId: 'o1' });
const ownerActor: Actor = actorWith({ id: 'ou_owner', orgId: 'o1', owner: true });
const modActor: Actor = actorWith({
  id: 'ou_mod',
  orgId: 'o1',
  content: { cmy_1: ['communities:moderate'] },
});
const people: MemberReportServiceParams['people'] = {
  systemActor: () => SYSTEM,
  holders: async () => [],
  permissionsOfMany: async (_orgId, ids) =>
    new Map(ids.map((id) => [id, actorWith({ id, orgId: 'o1' }).permissions])),
};

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
    eventAttendees: async () => ({ rows: [], total: 0, page: 1, pageSize: 10 }),
    eventFaces: async () => ({}),
    directEventGrants: async () => [],
    events: async () => ({ rows: [], total: 0, page: 1, pageSize: 20 }),
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
    findCourse: async (id: string) => courses[id] ?? null,
    listCourseModules: async (courseId: string) => modules[courseId] ?? [],
    listCourseActivities: async (courseId: string) => activities[courseId] ?? [],
    listCourseActivityViews: async (courseId: string) =>
      (activities[courseId] ?? []).map((a) => ({ ...a, assetUrls: {} })),
  } as unknown as ContentServicePort;
}

const fileUrls = createFileUrls('https://api.test', (key) => `https://cdn.test/${key}`);
const files = { signFile: async (_orgId: string, assetId: string) => `https://signed/${assetId}` };

const readers: Pick<
  MemberReportServiceParams,
  | 'notifications'
  | 'titles'
  | 'subscriptions'
  | 'notificationCategories'
  | 'notificationSettings'
  | 'channels'
  | 'studentPortalUrl'
> = {
  studentPortalUrl: 'https://app.test',
  notifications: {
    list: async () => ({ items: [], total: 0, unreadCount: 0 }),
    get: async () => null,
    unreadCounts: async () => ({ org: 0, communities: [] }),
  },
  titles: {
    discussion: { titlesFor: async () => ({}) },
    content: { titlesFor: async () => ({}) },
  },
  subscriptions: { viewerSubscriptions: async () => ({}) },
  notificationCategories: {
    community: { get: async () => ({ categories: [], source: 'default' }) },
    org: { get: async () => ({ categories: [], source: 'default' }) },
  },
  notificationSettings: { get: async () => [] },
  channels: { list: () => ['inApp'] },
};

const deps: Pick<
  MemberReportServiceParams,
  | 'files'
  | 'fileUrls'
  | 'access'
  | 'people'
  | 'notifications'
  | 'titles'
  | 'subscriptions'
  | 'notificationCategories'
  | 'notificationSettings'
  | 'channels'
  | 'studentPortalUrl'
> = {
  files,
  fileUrls,
  access: {
    isCommunityMember: async () => false,
    openSpaceIds: async () => [],
    spaceStandings: async () => ({}),
    hasAccess: async () => false,
    listAccessibleContent: async () => [],
    openCommunityIds: async () => [],
    opensEverySpace: async () => false,
    everySpaceOpeners: async () => [],
  },
  people,
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
    findCourse: async () => null,
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
    findDownload: async () => null,
    createDownload: rejectMutation,
    updateDownload: rejectMutation,
    removeDownload: rejectMutation,
    listDownloadAssets: async () => [],
    addDownloadAsset: rejectMutation,
    removeDownloadAsset: rejectMutation,
    renameDownloadAsset: rejectMutation,
    reorderDownloadAssets: rejectMutation,
    listCommunities: async () => ({ rows: [], total: 0, page: 1, pageSize: 20 }),
    findCommunity: async () => null,
    listCommunitiesById: async () => [],
    communitiesWithDigest: async () => [],
    createCommunity: rejectMutation,
    updateCommunity: rejectMutation,
    publishCommunity: rejectMutation,
    unpublishCommunity: rejectMutation,
    deleteCommunity: rejectMutation,
    patchCommunitySettings: rejectMutation,
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
  } as unknown as ContentServicePort;
}

// Full-surface MemberReportRepository fake.
function fakeEntitlementReader(over: Partial<MemberReportRepository> = {}): MemberReportRepository {
  return {
    directory: async () => ({ rows: [], total: 0, page: 1, pageSize: 20 }),
    spaceMemberCounts: async () => ({}),
    people: async () => [],
    eventAttendees: async () => ({ rows: [], total: 0, page: 1, pageSize: 10 }),
    eventFaces: async () => ({}),
    directEventGrants: async () => [],
    events: async () => ({ rows: [], total: 0, page: 1, pageSize: 20 }),
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
    const rows = await svc.listCourses(stu);
    expect(rows.map((c) => c.id)).toEqual(['c1']);
  });

  it('throws NotFoundError for a course the student is not enrolled in', async () => {
    const svc = new MemberReportServiceImpl({
      repo: fakeRepo(),
      content: fakeContent({ c1: course('c1') }, {}),
      progress: fakeProgress([]),
      ...deps,
      access: grantedAccess([{ orgId: 'o1', contentId: 'c1' }]),
    });
    await expect(svc.getCourse('cX', stu)).rejects.toThrow(NotFoundError);
    await expect(svc.listModules('cX', stu)).rejects.toThrow(NotFoundError);
  });

  it('does not return a course enrolled in another org', async () => {
    const svc = new MemberReportServiceImpl({
      repo: fakeRepo(),
      content: fakeContent({ c1: course('c1') }, {}),
      progress: fakeProgress([]),
      ...deps,
      access: grantedAccess([{ orgId: 'o2', contentId: 'c1' }]),
    });
    expect(await svc.listCourses(stu)).toEqual([]);
    await expect(svc.getCourse('c1', stu)).rejects.toThrow(NotFoundError);
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
  it('throws NotFoundError when the student is not enrolled', async () => {
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
    await expect(svc.courseProgress('c1', stu)).rejects.toThrow(NotFoundError);
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
    const view = await svc.courseProgress('c1', stu);
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
    const view = await svc.courseProgress('c1', stu);
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
    const view = await svc.courseProgress('c1', stu);
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
        findCourse: async () => ({ ...course('c1'), thumbnailUrl: null }),
        listCourseActivityViews: async () => views,
      }),
      progress: fakeProgress([]),
      ...deps,
      access: grantedAccess([{ orgId: 'o1', contentId: 'c1' }]),
    });

    expect(await svc.listActivities('c1', stu)).toEqual([views[0]]);
  });

  it('returns no activities for a course the student is not enrolled in', async () => {
    const svc = new MemberReportServiceImpl({
      repo: fakeEntitlementReader(),
      content: fakeContentService(),
      progress: fakeProgress([]),
      ...deps,
    });

    await expect(svc.listActivities('c1', stu)).rejects.toThrow(NotFoundError);
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
        findDownload: async () => download,
        listDownloadAssets: async () => files,
      }),
      progress: fakeProgress([]),
      ...deps,
      access: grantedAccess([{ orgId: 'o1', contentId: 'd1' }]),
    });

    expect(await svc.getDownload('d1', stu)).toEqual({ download, assets: files });
  });

  it('serves no download the student is not entitled to', async () => {
    const svc = new MemberReportServiceImpl({
      repo: fakeEntitlementReader(),
      content: fakeContentService({ findDownload: async () => ({ status: 'published' }) as never }),
      progress: fakeProgress([]),
      ...deps,
    });

    await expect(svc.getDownload('d1', stu)).rejects.toThrow(NotFoundError);
  });

  it('adds the signed photo URL to each directory entry', async () => {
    const row = {
      orgUserId: 'ou_sarah',
      userId: 'usr_sarah',
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
      content: fakeContentService({ findCommunity: async () => ({ id: 'cmy_1' }) as never }),
      progress: fakeProgress([]),
      files,
      fileUrls,
      people,
      access: {
        ...deps.access,
        isCommunityMember: async () => true,
        openSpaceIds: async () => [],
        spaceStandings: async () => ({}),
      },
      ...readers,
    });

    const entries = await svc.directory(
      'cmy_1',
      {
        page: 1,
        pageSize: 20,
      },
      actorWith({ id: 'ou_sarah', orgId: 'o1' }),
    );

    expect(entries).toMatchObject({ total: 2, page: 1, pageSize: 20 });
    expect(entries?.rows.map((e) => [e.orgUserId, e.imageUrl])).toEqual([
      ['ou_sarah', fileUrls.publicImage('o1', 'ou_sarah', 'ast_photo')],
      ['ou_james', null],
    ]);
  });

  it('names what each notification refers to and leaves out what the viewer cannot see', async () => {
    const stored = {
      orgId: 'o1',
      userId: 'usr_james',
      type: 'comment.created',
      scope: 'space' as const,
      reasons: ['post_author' as const, 'thread_participant' as const],
      matchedReason: 'post_author' as const,
      category: 'comments_on_my_posts',
      communityId: 'cmy_1',
      spaceId: 'spc_1',
      actorId: 'ou_sarah',
      display: { postTitle: 'Launch week', commenterName: 'Sarah', excerpt: 'Nice' },
      createdAt: AT,
      readAt: null,
    };
    const list = vi.fn(async () => ({
      items: [
        {
          ...stored,
          id: 'ntf_1',
          subject: { type: 'comment' as const, id: 'cmt_1' },
          parent: { type: 'post' as const, id: 'pst_seen' },
        },
        {
          ...stored,
          id: 'ntf_2',
          spaceId: 'spc_hidden',
          subject: { type: 'comment' as const, id: 'cmt_2' },
          parent: { type: 'post' as const, id: 'pst_hidden' },
        },
      ],
      total: 2,
      unreadCount: 2,
    }));
    const discussionTitles = vi.fn(async () => ({
      'comment:cmt_1': { title: 'Launch week', excerpt: 'Nice' },
      'post:pst_seen': { title: 'Launch week' },
    }));
    const contentTitles = vi.fn(async () => ({
      'community:cmy_1': { title: 'Founders' },
      'space:spc_1': { title: 'Announcements' },
    }));
    const svc = new MemberReportServiceImpl({
      repo: fakeEntitlementReader({
        people: async () => [
          {
            orgUserId: 'ou_sarah',
            userId: 'usr_sarah',
            displayName: 'Sarah',
            headline: null,
            bio: null,
            imageAssetId: 'ast_photo',
          },
        ],
      }),
      content: fakeContentService(),
      progress: fakeProgress([]),
      ...deps,
      notifications: { ...deps.notifications, list },
      titles: {
        discussion: { titlesFor: discussionTitles },
        content: { titlesFor: contentTitles },
      },
    });
    const james = { ...actorWith({ id: 'ou_james', orgId: 'o1' }), userId: 'usr_james' };

    const view = await svc.notifications(
      { communityId: 'cmy_1', unread: true },
      { page: 2, pageSize: 10 },
      james,
    );

    expect(list).toHaveBeenCalledWith(
      { communityId: 'cmy_1', unread: true },
      { page: 2, pageSize: 10 },
      james,
    );
    expect(discussionTitles).toHaveBeenCalledWith(
      expect.arrayContaining([
        { type: 'comment', id: 'cmt_1' },
        { type: 'post', id: 'pst_hidden' },
      ]),
      james,
    );
    expect(view).toMatchObject({ total: 2, page: 2, pageSize: 10, unreadCount: 2 });
    expect(view.rows[0]).toEqual({
      id: 'ntf_1',
      type: 'comment.created',
      scope: 'space',
      reasons: ['post_author', 'thread_participant'],
      matchedReason: 'post_author',
      category: 'comments_on_my_posts',
      display: { postTitle: 'Launch week', commenterName: 'Sarah', excerpt: 'Nice' },
      community: { id: 'cmy_1', title: 'Founders' },
      space: { id: 'spc_1', name: 'Announcements' },
      actor: {
        orgUserId: 'ou_sarah',
        name: 'Sarah',
        imageUrl: fileUrls.publicImage('o1', 'ou_sarah', 'ast_photo'),
      },
      subject: { type: 'comment', id: 'cmt_1', excerpt: 'Nice' },
      parent: { type: 'post', id: 'pst_seen', title: 'Launch week' },
      createdAt: AT,
      readAt: null,
    });
    expect(view.rows[1]).toMatchObject({ space: null, subject: null, parent: null });
  });

  it('reads one notification in the list shape, and throws NotFoundError when it is not the person’s', async () => {
    const stored = {
      id: 'ntf_1',
      orgId: 'o1',
      userId: 'usr_james',
      type: 'access.granted',
      scope: 'org' as const,
      reasons: ['subject' as const],
      matchedReason: 'subject' as const,
      category: 'access',
      communityId: null,
      spaceId: null,
      actorId: null,
      subject: { type: 'course' as const, id: 'crs_1' },
      parent: null,
      display: { contentTitle: 'Spanish basics', contentType: 'course' },
      createdAt: AT,
      readAt: AT,
    };
    const get = vi.fn(async (id: string) => (id === 'ntf_1' ? stored : null));
    const svc = new MemberReportServiceImpl({
      repo: fakeEntitlementReader(),
      content: fakeContentService(),
      progress: fakeProgress([]),
      ...deps,
      notifications: { ...deps.notifications, get },
      titles: {
        discussion: { titlesFor: async () => ({}) },
        content: { titlesFor: async () => ({ 'course:crs_1': { title: 'Spanish basics' } }) },
      },
    });
    const james = { ...actorWith({ id: 'ou_james', orgId: 'o1' }), userId: 'usr_james' };

    await expect(svc.notification('ntf_1', james)).resolves.toEqual({
      id: 'ntf_1',
      type: 'access.granted',
      scope: 'org',
      reasons: ['subject'],
      matchedReason: 'subject',
      category: 'access',
      display: { contentTitle: 'Spanish basics', contentType: 'course' },
      community: null,
      space: null,
      actor: null,
      subject: { type: 'course', id: 'crs_1', title: 'Spanish basics' },
      parent: null,
      createdAt: AT,
      readAt: AT,
    });
    expect(get).toHaveBeenCalledWith('ntf_1', james);
    await expect(svc.notification('ntf_x', james)).rejects.toThrow(NotFoundError);
  });

  it('counts unread notifications for the org and every community the person can open', async () => {
    const unreadCounts = vi.fn(async (ids: string[]) => ({
      org: 3,
      communities: ids.map((communityId) => ({ communityId, unread: 1 })),
    }));
    const openCommunityIds = vi.fn(async () => ['cmy_1', 'cmy_2']);
    const svc = new MemberReportServiceImpl({
      repo: fakeEntitlementReader(),
      content: fakeContentService(),
      progress: fakeProgress([]),
      ...deps,
      access: { ...deps.access, openCommunityIds },
      notifications: { ...deps.notifications, unreadCounts },
    });
    const owner = { ...ownerActor, userId: 'usr_owner' };

    await expect(svc.notificationUnreadCounts(owner)).resolves.toEqual({
      org: 3,
      communities: [
        { communityId: 'cmy_1', unread: 1 },
        { communityId: 'cmy_2', unread: 1 },
      ],
    });
    expect(openCommunityIds).toHaveBeenCalledWith(owner);
    expect(unreadCounts).toHaveBeenCalledWith(['cmy_1', 'cmy_2'], owner);
  });
});

describe('serving files', () => {
  const student = stu;
  const owner = ownerActor;
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
        findCourse: async (id) => (id === 'c1' ? { ...course('c1'), thumbnailUrl: null } : null),
        getActivity: async (id) => (id === 'a1' ? activity('a1', 0) : null),
        listCourseActivityAssets: async () => [link('a1', 'ast_video')],
        findDownload: async () =>
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
    expect(await svc.activityFile('a1', 'ast_video', student)).toBe('https://signed/ast_video');
    expect(signed).toEqual([{ assetId: 'ast_video' }]);
  });

  it('refuses a lesson file without access, unlinked, in a draft lesson or course, but lets staff through', async () => {
    await expect(
      build({ grants: [] }).svc.activityFile('a1', 'ast_video', student),
    ).rejects.toThrow(NotFoundError);
    await expect(build().svc.activityFile('a1', 'ast_other', student)).rejects.toThrow(
      NotFoundError,
    );
    const draftLesson = build({
      content: { getActivity: async () => activity('a1', 0, { published: false }) },
    });
    await expect(draftLesson.svc.activityFile('a1', 'ast_video', student)).rejects.toThrow(
      NotFoundError,
    );
    const draftCourse = build({
      content: { findCourse: async () => ({ ...course('c1', 'draft'), thumbnailUrl: null }) },
    });
    await expect(draftCourse.svc.activityFile('a1', 'ast_video', student)).rejects.toThrow(
      NotFoundError,
    );
    expect(await build({ grants: [] }).svc.activityFile('a1', 'ast_video', owner)).toBe(
      'https://signed/ast_video',
    );
    await expect(build({ grants: [] }).svc.activityFile('a1', 'ast_other', owner)).rejects.toThrow(
      NotFoundError,
    );
  });

  it('serves a download file saved under its display name, or its filename', async () => {
    const { svc, signed } = build();
    expect(await svc.downloadFile('d1', 'ast_pdf', student)).toBe('https://signed/ast_pdf');
    expect(await svc.downloadFile('d1', 'ast_notes', student)).toBe('https://signed/ast_notes');
    await expect(svc.downloadFile('d1', 'ast_missing', student)).rejects.toThrow(NotFoundError);
    expect(signed).toEqual([
      { assetId: 'ast_pdf', saveAs: 'Workbook.pdf' },
      { assetId: 'ast_notes', saveAs: 'ast_notes.pdf' },
    ]);
    await expect(build({ grants: [] }).svc.downloadFile('d1', 'ast_pdf', student)).rejects.toThrow(
      NotFoundError,
    );
  });

  it('serves the thumbnail of a published item to anyone, and of a draft only to staff', async () => {
    const { svc } = build({ grants: [] });
    expect(await svc.thumbnailFile('download', 'd1', student)).toBe('https://signed/ast_thumb');
    const draft = build({
      content: {
        findCourse: async () =>
          ({
            ...course('c1', 'draft'),
            thumbnailAssetId: 'ast_cover',
            thumbnailUrl: null,
          }) as never,
      },
    });
    await expect(draft.svc.thumbnailFile('course', 'c1', student)).rejects.toThrow(NotFoundError);
    expect(await draft.svc.thumbnailFile('course', 'c1', owner)).toBe('https://signed/ast_cover');
    await expect(svc.thumbnailFile('course', 'c1', student)).rejects.toThrow(NotFoundError);
  });
});

describe('community home', () => {
  const student = stu;
  const moderator = modActor;
  const owner = ownerActor;
  const everySpace = (actor: Actor) =>
    actor.permissions.has('communities:read', 'cmy_1') ||
    actor.permissions.has('communities:moderate', 'cmy_1');
  const settings = { comments: true, reactions: true, requireReview: false };
  let communityStatus: 'draft' | 'published' = 'published';
  const topic = (spaceId: string) => ({
    orgId: 'o1',
    id: `top_${spaceId}`,
    spaceId,
    name: 'Wins',
    seq: 0,
    createdAt: AT,
    updatedAt: AT,
  });
  const space = (
    id: string,
    accessRule: SpaceDetail['accessRule'],
    over: Partial<SpaceView> = {},
  ): SpaceView => ({
    orgId: 'o1',
    id,
    communityId: 'cmy_1',
    name: `Space ${id}`,
    description: `About ${id}`,
    seq: 0,
    accessRule,
    capacity: null,
    settings,
    coverAssetId: null,
    backgroundAssetId: null,
    iconAssetId: null,
    coverUrl: null,
    backgroundUrl: null,
    iconUrl: null,
    topics: [topic(id)],
    links: [],
    createdAt: AT,
    updatedAt: AT,
    ...over,
  });
  const link = (spaceId: string, contentId: string) => ({
    orgId: 'o1',
    id: `lnk_${contentId}`,
    spaceId,
    contentId,
    seq: 0,
    createdAt: AT,
    updatedAt: AT,
  });
  const spaces = [
    space('spc_all', 'all_members', {
      links: [link('spc_all', 'c1'), link('spc_all', 'c_draft'), link('spc_all', 'd_draft')],
    }),
    space('spc_request', 'by_request', {
      iconAssetId: 'ast_icon',
      iconUrl: 'https://cdn.test/public/o1/spc_request/ast_icon',
    }),
    space('spc_secret', 'by_invite'),
    space('spc_invited', 'by_invite'),
    space('spc_joined', 'by_invite'),
  ];
  const build = (
    standings: Record<string, SpaceMember['status']> = {},
    muted: Record<string, { state: 'muted'; mutedUntil: Date | null }> = {},
  ) =>
    new MemberReportServiceImpl({
      repo: fakeEntitlementReader({ spaceMemberCounts: async () => ({ spc_request: 4 }) }),
      content: fakeContentService({
        findCommunity: async (id) =>
          id === 'cmy_1'
            ? ({
                id,
                title: 'Founders',
                description: '',
                thumbnailUrl: null,
                status: communityStatus,
                settings: { dm: {} },
              } as never)
            : null,
        listSpaces: async () => spaces,
        getSpace: async (id) => spaces.find((row) => row.id === id) ?? null,
        findCourse: async (id) =>
          id === 'c1' || id === 'c_draft'
            ? { ...course(id, id === 'c1' ? 'published' : 'draft'), thumbnailUrl: null }
            : null,
        findDownload: async (id) =>
          id === 'd_draft' ? ({ id, title: 'Draft pack', status: 'draft' } as never) : null,
      }),
      progress: fakeProgress([]),
      ...deps,
      subscriptions: {
        viewerSubscriptions: async (_o, orgUserId, itemType, itemIds) =>
          orgUserId === student.id && itemType === 'space'
            ? Object.fromEntries(itemIds.flatMap((id) => (muted[id] ? [[id, muted[id]]] : [])))
            : {},
      },
      access: {
        ...deps.access,
        isCommunityMember: async () => true,
        opensEverySpace: async (actor) => everySpace(actor),
        openSpaceIds: async (_c, actor) =>
          !everySpace(actor)
            ? spaces
                .filter((row) => row.accessRule === 'all_members' || standings[row.id] === 'active')
                .map((row) => row.id)
            : spaces.map((row) => row.id),
        spaceStandings: async (_c, actor) => (everySpace(actor) ? {} : standings),
      },
    });

  it("serves a space's image to anyone in a published community, and in a draft one only with communities:read", async () => {
    const svc = build();
    expect(await svc.spaceImageFile('spc_request', 'icon', student)).toBe(
      'https://signed/ast_icon',
    );
    await expect(svc.spaceImageFile('spc_request', 'cover', student)).rejects.toThrow(
      NotFoundError,
    );
    await expect(svc.spaceImageFile('spc_missing', 'icon', student)).rejects.toThrow(NotFoundError);
    communityStatus = 'draft';
    try {
      await expect(svc.spaceImageFile('spc_request', 'icon', student)).rejects.toThrow(
        NotFoundError,
      );
      expect(await svc.spaceImageFile('spc_request', 'icon', owner)).toBe(
        'https://signed/ast_icon',
      );
    } finally {
      communityStatus = 'published';
    }
  });

  it('hides an uninvited by-invite space and locks a space the member cannot open', async () => {
    const svc = build({ spc_invited: 'invited', spc_joined: 'active' });
    const home = await svc.communityHome('cmy_1', student);
    expect(home?.spaces.map((row) => row.id)).toEqual([
      'spc_all',
      'spc_request',
      'spc_invited',
      'spc_joined',
    ]);
    const byId = new Map(home!.spaces.map((row) => [row.id, row]));
    expect(byId.get('spc_request')).toEqual({
      id: 'spc_request',
      name: 'Space spc_request',
      memberCount: 4,
      accessRule: 'by_request',
      standing: 'none',
      coverUrl: null,
      backgroundUrl: null,
      iconUrl: 'https://cdn.test/public/o1/spc_request/ast_icon',
      locked: true,
    });
    expect(byId.get('spc_invited')).toEqual({
      id: 'spc_invited',
      name: 'Space spc_invited',
      memberCount: 0,
      accessRule: 'by_invite',
      standing: 'invited',
      coverUrl: null,
      backgroundUrl: null,
      iconUrl: null,
      locked: true,
    });
    expect(byId.get('spc_joined')).toMatchObject({
      locked: false,
      standing: 'member',
      description: 'About spc_joined',
      topics: [{ id: 'top_spc_joined', name: 'Wins' }],
    });
  });

  it('carries your mute on each space you can open and leaves it off a locked one', async () => {
    const until = new Date('2030-01-01T00:00:00Z');
    const svc = build(
      {},
      {
        spc_all: { state: 'muted', mutedUntil: until },
        spc_request: { state: 'muted', mutedUntil: null },
      },
    );
    const home = await svc.communityHome('cmy_1', student);
    const byId = new Map(home!.spaces.map((row) => [row.id, row]));
    expect(byId.get('spc_all')).toMatchObject({
      locked: false,
      subscription: { state: 'muted', mutedUntil: until },
    });
    expect(byId.get('spc_request')).not.toHaveProperty('subscription');
    expect(await svc.communitySpace('cmy_1', 'spc_all', moderator)).toMatchObject({
      subscription: null,
    });
  });

  it('serves a locked space by id as its landing view and a hidden one as missing', async () => {
    const svc = build({ spc_invited: 'invited', spc_secret: 'revoked' });
    await expect(svc.communitySpace('cmy_1', 'spc_secret', student)).rejects.toThrow(NotFoundError);
    await expect(svc.communitySpace('cmy_1', 'spc_missing', student)).rejects.toThrow(
      NotFoundError,
    );
    const locked = await svc.communitySpace('cmy_1', 'spc_request', student);
    expect(locked).toMatchObject({ locked: true });
    expect(locked).not.toHaveProperty('description');
    expect(locked).not.toHaveProperty('topics');
    expect(locked).not.toHaveProperty('links');
    expect(locked).not.toHaveProperty('settings');
    expect(await svc.communitySpace('cmy_1', 'spc_invited', student)).toMatchObject({
      locked: true,
      standing: 'invited',
    });
  });

  it('shows every space unlocked to a moderator and to staff', async () => {
    const svc = build();
    for (const actor of [moderator, owner]) {
      const home = await svc.communityHome('cmy_1', actor);
      expect(home?.spaces.map((row) => [row.id, row.locked])).toEqual(
        spaces.map((row) => [row.id, false]),
      );
    }
  });

  it('leaves out links to unpublished content for members, but not for staff', async () => {
    const svc = build();
    const linked = async (actor: Actor) => {
      const view = await svc.communitySpace('cmy_1', 'spc_all', actor);
      return view && !view.locked ? view.links.map((row) => row.contentId) : null;
    };
    expect(await linked(student)).toEqual(['c1']);
    expect(await linked(moderator)).toEqual(['c1']);
    expect(await linked(owner)).toEqual(['c1', 'c_draft', 'd_draft']);
  });
});

describe('read permissions open content without a grant', () => {
  const james = actorWith({
    id: 'ou_james',
    orgId: 'o1',
    content: { c1: ['courses:read'], d1: ['downloads:read'], cmy_1: ['communities:read'] },
  });
  const draftCourse = {
    ...course('c1', 'draft'),
    thumbnailAssetId: 'ast_cover',
    thumbnailUrl: null,
  };
  const build = () =>
    new MemberReportServiceImpl({
      repo: fakeRepo(),
      content: fakeContentService({
        findCourse: async (id) => (id === 'c1' || id === 'c2' ? { ...draftCourse, id } : null),
        listCourseModules: async () => progressModules,
        findDownload: async (id) => ({ id, status: 'draft', thumbnailAssetId: 'ast_dl' }) as never,
        listDownloadAssets: async () => [],
        findCommunity: async (id) =>
          ({ id, status: 'draft', thumbnailAssetId: 'ast_cmy' }) as never,
      }),
      progress: fakeProgress([]),
      ...deps,
    });

  it('opens an unpublished course and its modules with courses:read on it', async () => {
    const svc = build();
    expect(await svc.getCourse('c1', james)).toMatchObject({ id: 'c1' });
    expect(await svc.listModules('c1', james)).toEqual(progressModules);
    await expect(svc.getCourse('c2', james)).rejects.toThrow(NotFoundError);
    await expect(svc.getCourse('c1', stu)).rejects.toThrow(NotFoundError);
  });

  it('opens an unpublished download with downloads:read on it', async () => {
    const svc = build();
    expect(await svc.getDownload('d1', james)).toMatchObject({ download: { id: 'd1' } });
    await expect(svc.getDownload('d2', james)).rejects.toThrow(NotFoundError);
  });

  it("serves an unpublished item's thumbnail with its read permission only", async () => {
    const svc = build();
    expect(await svc.thumbnailFile('course', 'c1', james)).toBe('https://signed/ast_cover');
    expect(await svc.thumbnailFile('download', 'd1', james)).toBe('https://signed/ast_dl');
    expect(await svc.thumbnailFile('community', 'cmy_1', james)).toBe('https://signed/ast_cmy');
    await expect(svc.thumbnailFile('community', 'cmy_2', james)).rejects.toThrow(NotFoundError);
    await expect(svc.thumbnailFile('course', 'c1', stu)).rejects.toThrow(NotFoundError);
  });
});

describe('a learner with a grant', () => {
  it('opens their course and its lessons, with every content read passing the system actor', async () => {
    const seen: Actor[] = [];
    const record = <T>(actor: Actor, value: T) => {
      seen.push(actor);
      return value;
    };
    const svc = new MemberReportServiceImpl({
      repo: fakeRepo(),
      content: fakeContentService({
        findCourse: async (id, actor) =>
          record(actor, id === 'c1' ? { ...course('c1'), thumbnailUrl: null } : null),
        listCourseModules: async (_id, actor) => record(actor, progressModules),
        listCourseActivityViews: async (_id, actor) =>
          record(
            actor,
            progressActivities.map((a) => ({ ...a, assetUrls: {} })),
          ),
        listCourseActivities: async (_id, actor) => record(actor, progressActivities),
      }),
      progress: fakeProgress([]),
      ...deps,
      access: grantedAccess([{ orgId: 'o1', contentId: 'c1' }]),
    });
    expect((await svc.listCourses(stu)).map((c) => c.id)).toEqual(['c1']);
    expect(await svc.getCourse('c1', stu)).toMatchObject({ id: 'c1' });
    expect(await svc.listModules('c1', stu)).toEqual(progressModules);
    expect((await svc.listActivities('c1', stu))?.map((a) => a.id)).toEqual(['a1', 'a2']);
    expect(await svc.courseProgress('c1', stu)).toMatchObject({ percent: 0 });
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((actor) => actor === SYSTEM)).toBe(true);
  });

  it('opens their community home, with the viewer it sees there', async () => {
    const getCommunity = vi.fn(async () => ({
      id: 'cmy_1',
      title: 'Spring cohort',
      description: '',
      thumbnailUrl: null,
      status: 'published',
      settings: { dm: {} },
    }));
    const svc = new MemberReportServiceImpl({
      repo: fakeRepo(),
      content: fakeContentService({
        findCommunity: getCommunity as never,
        listSpaces: async () => [],
      }),
      progress: fakeProgress([]),
      ...deps,
      access: { ...deps.access, isCommunityMember: async () => true },
    });
    const home = await svc.communityHome('cmy_1', stu);
    expect(home?.viewer).toEqual({
      permissions: [],
      opensEverySpace: false,
      team: false,
      roleName: 'Member',
      canCreateEvents: false,
    });
    expect(getCommunity).toHaveBeenCalledWith('cmy_1', SYSTEM);
    const emma = actorWith({
      id: 'ou_emma',
      orgId: 'o1',
      content: { cmy_1: ['communities:moderate'] },
      contentRoles: { cmy_1: { key: 'moderator', name: 'Moderator', team: true } },
    });
    const moderated = new MemberReportServiceImpl({
      repo: fakeRepo(),
      content: fakeContentService({
        findCommunity: getCommunity as never,
        listSpaces: async () => [],
      }),
      progress: fakeProgress([]),
      ...deps,
      access: {
        ...deps.access,
        isCommunityMember: async () => true,
        opensEverySpace: async () => true,
      },
    });
    expect((await moderated.communityHome('cmy_1', emma))?.viewer).toEqual({
      permissions: ['communities:moderate'],
      opensEverySpace: true,
      team: true,
      roleName: 'Moderator',
      canCreateEvents: false,
    });
    const tom = actorWith({ id: 'ou_tom', orgId: 'o1', org: ['events:write'] });
    expect((await moderated.communityHome('cmy_1', tom))?.viewer.canCreateEvents).toBe(true);
  });

  it('refuses a community home to someone who is not a member', async () => {
    const svc = new MemberReportServiceImpl({
      repo: fakeRepo(),
      content: fakeContentService(),
      progress: fakeProgress([]),
      ...deps,
    });
    await expect(svc.communityHome('cmy_1', stu)).rejects.toThrow(NotFoundError);
  });
});

describe('directory and viewer', () => {
  it('marks team and who opens every space, resolved on the community', async () => {
    const row = {
      orgUserId: 'ou_emma',
      userId: 'usr_emma',
      displayName: 'Emma',
      headline: null,
      bio: null,
      imageAssetId: null,
    };
    const directory = vi.fn(async () => ({
      rows: [row, { ...row, orgUserId: 'ou_oliver', userId: 'usr_oliver' }],
      total: 2,
      page: 1,
      pageSize: 20,
    }));
    const holders = vi.fn(async () => ['ou_sarah']);
    const svc = new MemberReportServiceImpl({
      repo: { ...fakeRepo(), directory },
      content: fakeContentService({ findCommunity: async () => ({ id: 'cmy_1' }) as never }),
      progress: fakeProgress([]),
      ...deps,
      access: { ...deps.access, isCommunityMember: async () => true },
      people: {
        ...people,
        holders,
        permissionsOfMany: async (_o, ids) =>
          new Map(
            ids.map((id) => [
              id,
              (id === 'ou_emma'
                ? actorWith({
                    id,
                    orgId: 'o1',
                    content: { cmy_1: ['communities:moderate'] },
                    contentRoles: { cmy_1: { key: 'moderator', name: 'Moderator', team: true } },
                  })
                : actorWith({ id, orgId: 'o1' })
              ).permissions,
            ]),
          ),
      },
    });
    const page = await svc.directory('cmy_1', { page: 1, pageSize: 20 }, stu);
    expect(holders).toHaveBeenCalledWith('o1', 'communities:read', 'cmy_1');
    expect(directory).toHaveBeenCalledWith('o1', 'cmy_1', { page: 1, pageSize: 20 }, ['ou_sarah']);
    expect(page?.rows.map((r) => [r.orgUserId, r.team, r.roleName, r.opensEverySpace])).toEqual([
      ['ou_emma', true, 'Moderator', true],
      ['ou_oliver', false, null, false],
    ]);
  });

  it("names the viewer's org role and the permissions they hold", () => {
    const svc = new MemberReportServiceImpl({
      repo: fakeRepo(),
      content: fakeContentService(),
      progress: fakeProgress([]),
      ...deps,
    });
    const james = actorWith({ id: 'ou_james', orgId: 'o1', content: { c1: ['courses:write'] } });
    expect(svc.viewer(james)).toEqual({
      orgUserId: 'ou_james',
      orgRole: { key: 'member', name: 'Member' },
      permissions: ['courses:read', 'courses:write'],
      orgPermissions: [],
    });
  });
});
