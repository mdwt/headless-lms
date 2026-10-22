import type { AssetsService } from '@headless-lms/core/assets';
import type {
  CommunityMailReads,
  GrantWriter,
  ScheduledWork,
} from '@headless-lms/core/automations';
import type { ContentService } from '@headless-lms/core/content';
import type { ChatService, DiscussionService, PostService } from '@headless-lms/core/discussion';
import type { EntitlementsService } from '@headless-lms/core/entitlements';
import type { IdentityService } from '@headless-lms/core/identity';
import { STAFF_ROLES, type OrganizationService } from '@headless-lms/core/organizations';

const PAGE = 100;
const UNATTACHED_UPLOAD_GRACE_MS = 60 * 60 * 1000;

type Deps = {
  content: ContentService;
  entitlements: EntitlementsService;
  organizations: OrganizationService;
  identity: IdentityService;
  posts: PostService;
  discussion: DiscussionService;
  chats: ChatService;
  assets: AssetsService;
};

export async function listCommunityIds(
  content: Pick<ContentService, 'listCommunities'>,
  orgId: string,
): Promise<string[]> {
  const ids: string[] = [];
  let page = 1;
  for (;;) {
    const result = await content.listCommunities(orgId, {
      page,
      pageSize: PAGE,
      status: 'published',
    });
    ids.push(...result.rows.map((row) => row.id));
    if (result.rows.length < PAGE) {
      return ids;
    }
    page += 1;
  }
}

export function communityMail(deps: Deps): {
  mail: Omit<CommunityMailReads, 'recentMessageRecipients'>;
  grants: GrantWriter;
  scheduledWork: ScheduledWork;
} {
  const staff = [...STAFF_ROLES];
  const mail: Omit<CommunityMailReads, 'recentMessageRecipients'> = {
    async communityTitle(orgId, communityId) {
      return (await deps.content.getCommunity(orgId, communityId))?.title ?? null;
    },
    async space(orgId, spaceId) {
      const space = await deps.content.getSpace(orgId, spaceId);
      if (!space) {
        return null;
      }
      return { name: space.name, communityId: space.communityId, capacity: space.capacity };
    },
    async openSpaceNames(orgId, orgUserId, communityId) {
      const open = new Set(await deps.entitlements.openSpaceIdsFor(orgId, orgUserId, communityId));
      const spaces = await deps.content.listSpaces(orgId, communityId);
      return spaces.filter((space) => open.has(space.id)).map((space) => space.name);
    },
    grantOpensCommunity(orgId, grant, communityId) {
      return deps.entitlements.grantOpensCommunity(orgId, grant, communityId);
    },
    communitiesOpenedBy(orgId, grant) {
      return deps.entitlements.communitiesOpenedBy(orgId, grant);
    },
    async moderationAudience(orgId, communityId) {
      const [staffIds, moderators] = await Promise.all([
        deps.organizations.orgUserIdsByRole(orgId, staff),
        deps.entitlements.moderatorsWithAccess(orgId, communityId),
      ]);
      return [...new Set([...staffIds, ...moderators])];
    },
    staffIds(orgId) {
      return deps.organizations.orgUserIdsByRole(orgId, staff);
    },
    async displayName(orgId, orgUserId) {
      const orgUser = await deps.organizations.getOrgUserById(orgId, orgUserId);
      if (!orgUser) {
        return 'A member';
      }
      return deps.identity.displayName(orgUser.userId);
    },
    followerIds(orgId, postId) {
      return deps.posts.followerIds(orgId, postId);
    },
    async comment(orgId, commentId) {
      const comment = await deps.discussion.getComment(orgId, commentId);
      if (!comment) {
        return null;
      }
      return { orgUserId: comment.orgUserId, postId: comment.postId, body: comment.body };
    },
    async post(orgId, postId) {
      const post = await deps.posts.find(orgId, postId);
      if (!post) {
        return null;
      }
      return {
        title: post.title,
        body: post.body,
        spaceId: post.spaceId,
        orgUserId: post.orgUserId,
        communityId: post.communityId,
      };
    },
    async chat(orgId, chatId) {
      const summary = await deps.chats.chatSummary(orgId, chatId);
      if (!summary) {
        return null;
      }
      return {
        communityId: summary.chat.communityId,
        kind: summary.chat.kind,
        createdBy: summary.chat.createdBy,
        participants: summary.participants.map((participant) => ({
          orgUserId: participant.orgUserId,
          mutedUntil: participant.mutedUntil,
          leftAt: participant.leftAt,
        })),
      };
    },
    latestMessageBody(orgId, chatId) {
      return deps.chats.latestMessageBody(orgId, chatId);
    },
    pairBlocked(orgId, communityId, a, b) {
      return deps.chats.isBlocked(orgId, communityId, a, b);
    },
    activeMemberCount(orgId, spaceId) {
      return deps.entitlements.countActiveSpaceMembers(orgId, spaceId);
    },
    async memberCommunityTitles(orgId, orgUserId) {
      const ids = await deps.entitlements.communityIdsOpenedFor(orgId, orgUserId);
      const communities = await Promise.all(
        ids.map((id) => deps.content.getCommunity(orgId, id)),
      );
      return communities.flatMap((community) =>
        community && community.status === 'published'
          ? [{ id: community.id, title: community.title }]
          : [],
      );
    },
  };
  return {
    mail,
    grants: {
      grant: (orgId, input) => deps.entitlements.grant(orgId, input),
    },
    scheduledWork: {
      publishDuePosts: (orgId, now) => deps.posts.publishDue(orgId, now),
      hasDuePosts: (orgId, now) => deps.posts.hasDue(orgId, now),
      expireDueGrants: (orgId, now) => deps.entitlements.expireDue(orgId, now),
      sendDigest: (orgId, now) => deps.discussion.sendDigest(orgId, now),
      removeUnattachedUploads: async (orgId, now) => {
        await deps.assets.removeUnattached(
          orgId,
          new Date(now.getTime() - UNATTACHED_UPLOAD_GRACE_MS),
        );
      },
    },
  };
}
