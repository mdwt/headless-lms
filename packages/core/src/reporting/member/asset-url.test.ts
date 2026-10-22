import { describe, it, expect, vi } from 'vitest';
import { MemberReportServiceImpl, type MemberReportServiceParams } from './service.js';
import type { MemberReportRepository } from './ports.js';
import type { ContentServicePort } from '../../content/index.js';
import type { AssetsService } from '../../assets/index.js';
import type { ProgressService } from '../../progress/index.js';
import type { Actor } from '../../shared/actor.js';
import { ForbiddenError, NotFoundError } from '../../shared/errors.js';

const ORG = 'org_1';
const ASSET = 'asset_1';
const member: Actor = { id: 'ou_member', role: 'student' };

function repo(over: Partial<MemberReportRepository> = {}): MemberReportRepository {
  return {
    activeRefs: async () => [],
    activeRef: async () => null,
    activeDownloadRefs: async () => [],
    activeDownloadRef: async () => null,
    downloadHasAsset: async () => false,
    directory: async () => [],
    spaceMemberCounts: async () => ({}),
    ...over,
  };
}

function assets(status: 'ready' | 'pending' = 'ready'): AssetsService {
  return {
    get: async (orgId: string, id: string) =>
      id === ASSET ? ({ orgId, id, status, filename: 'me.png', key: 'k' } as never) : null,
    requestDownload: vi.fn(async () => ({ url: 'https://signed', asset: {} as never })),
  } as unknown as AssetsService;
}

function build(over: Partial<MemberReportServiceParams> = {}) {
  const svc = new MemberReportServiceImpl({
    repo: repo(),
    content: {} as ContentServicePort,
    progress: {} as ProgressService,
    assets: assets(),
    access: { isCommunityMember: async () => false, openSpaceIds: async () => [] },
    posts: {
      getPost: async (_orgId, _actor, postId) => {
        throw new NotFoundError('Post', postId);
      },
    },
    chats: {
      getMessage: async (_orgId, _actor, messageId) => {
        throw new NotFoundError('Message', messageId);
      },
    },
    profiles: { getProfile: async () => null },
    organizations: { getOrgUserById: async () => null },
    deliveryExpirySeconds: 300,
    ...over,
  });
  return svc;
}

describe('MemberReportService.assetUrl', () => {
  it('serves activity media through the course grant and the activity link', async () => {
    const content = {
      getActivity: async () => ({ id: 'act_1', courseId: 'course_1', settings: {} }),
      listCourseActivityAssets: async () => [{ activityId: 'act_1', assetId: ASSET }],
    } as unknown as ContentServicePort;
    const granted = build({
      content,
      repo: repo({ activeRef: async () => ({ orgId: ORG, contentId: 'course_1' }) }),
    });
    expect(await granted.assetUrl(ORG, member, ASSET, { activity: 'act_1' })).toMatchObject({
      url: 'https://signed',
    });
    expect(await granted.assetUrl(ORG, member, 'asset_other', { activity: 'act_1' })).toBeNull();

    const ungranted = build({ content });
    expect(await ungranted.assetUrl(ORG, member, ASSET, { activity: 'act_1' })).toBeNull();
  });

  it('serves a course, download or community thumbnail only through that content', async () => {
    const content = {
      getCourse: async () => ({ id: 'course_1', status: 'published', thumbnailAssetId: ASSET }),
      getDownload: async () => ({ id: 'dl_1', status: 'published', thumbnailAssetId: 'asset_x' }),
      listDownloadAssets: async () => [],
      getCommunity: async () => ({ id: 'cmy_1', thumbnailAssetId: ASSET }),
    } as unknown as ContentServicePort;
    const svc = build({
      content,
      repo: repo({
        activeRef: async () => ({ orgId: ORG, contentId: 'course_1' }),
        activeDownloadRef: async () => ({ orgId: ORG, contentId: 'dl_1' }),
      }),
      access: {
        isCommunityMember: async (_o, actor) => actor.id === member.id,
        openSpaceIds: async () => [],
      },
    });
    expect(await svc.assetUrl(ORG, member, ASSET, { course: 'course_1' })).not.toBeNull();
    expect(await svc.assetUrl(ORG, member, ASSET, { download: 'dl_1' })).toBeNull();
    expect(await svc.assetUrl(ORG, member, ASSET, { community: 'cmy_1' })).not.toBeNull();
    const outsider: Actor = { id: 'ou_other', role: 'student' };
    expect(await svc.assetUrl(ORG, outsider, ASSET, { community: 'cmy_1' })).toBeNull();
  });

  it('serves a post cover through the post read and swallows its refusals', async () => {
    const svc = build({
      posts: {
        getPost: async (_o, actor, postId) => {
          if (postId === 'post_hidden') {
            throw new ForbiddenError('You cannot open this space');
          }
          if (postId === 'post_missing') {
            throw new NotFoundError('Post', postId);
          }
          return { id: postId, coverAssetId: actor.id === member.id ? ASSET : null } as never;
        },
      },
    });
    expect(await svc.assetUrl(ORG, member, ASSET, { post: 'post_1' })).not.toBeNull();
    expect(await svc.assetUrl(ORG, member, ASSET, { post: 'post_hidden' })).toBeNull();
    expect(await svc.assetUrl(ORG, member, ASSET, { post: 'post_missing' })).toBeNull();
    expect(await svc.assetUrl(ORG, member, 'asset_other', { post: 'post_1' })).toBeNull();
  });

  it('serves a message attachment through the chat read', async () => {
    const svc = build({
      chats: {
        getMessage: async (_o, actor, messageId) => {
          if (actor.id !== member.id) {
            throw new NotFoundError('Message', messageId);
          }
          return { message: { id: messageId } as never, assetIds: [ASSET] };
        },
      },
    });
    expect(await svc.assetUrl(ORG, member, ASSET, { message: 'msg_1' })).not.toBeNull();
    expect(await svc.assetUrl(ORG, member, 'asset_other', { message: 'msg_1' })).toBeNull();
    const outsider: Actor = { id: 'ou_other', role: 'student' };
    expect(await svc.assetUrl(ORG, outsider, ASSET, { message: 'msg_1' })).toBeNull();
  });

  it('serves a profile photo only inside the org it was uploaded in', async () => {
    const svc = build({
      organizations: {
        getOrgUserById: async (_o, id) =>
          id === 'ou_sarah' ? ({ id, userId: 'user_sarah' } as never) : null,
      },
      profiles: {
        getProfile: async (userId) =>
          userId === 'user_sarah'
            ? ({ userId, imageAssetOrgId: ORG, imageAssetId: ASSET } as never)
            : null,
      },
    });
    expect(await svc.assetUrl(ORG, member, ASSET, { profile: 'ou_sarah' })).not.toBeNull();
    expect(await svc.assetUrl('org_2', member, ASSET, { profile: 'ou_sarah' })).toBeNull();
    expect(await svc.assetUrl(ORG, member, ASSET, { profile: 'ou_nobody' })).toBeNull();
  });

  it('never signs an asset that is not ready', async () => {
    const svc = build({
      assets: assets('pending'),
      posts: { getPost: async () => ({ coverAssetId: ASSET }) as never },
    });
    expect(await svc.assetUrl(ORG, member, ASSET, { post: 'post_1' })).toBeNull();
  });
});
