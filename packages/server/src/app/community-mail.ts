import type {
  DrizzleAutomationRunsRepository,
  DrizzleChatRepository,
  DrizzleDiscussionRepository,
  DrizzleEntitlementsRepository,
  DrizzlePostRepository,
} from '@headless-lms/adapter-db';
import type {
  CommunityMailReads,
  GrantWriter,
  ScheduledWork,
} from '@headless-lms/core/automations';
import type { ContentService } from '@headless-lms/core/content';
import type { DiscussionServiceImpl, PostServiceImpl } from '@headless-lms/core/discussion';
import type { EntitlementsServiceImpl } from '@headless-lms/core/entitlements';
import type { IdentityServiceImpl } from '@headless-lms/core/identity';
import type {
  OrganizationServiceImpl,
  OrganizationsRepository,
  TeamRole,
} from '@headless-lms/core/organizations';

const PAGE = 100;

type Deps = {
  content: ContentService;
  entitlements: EntitlementsServiceImpl;
  entitlementsRepo: DrizzleEntitlementsRepository;
  organizations: OrganizationServiceImpl;
  organizationsRepo: OrganizationsRepository;
  identity: IdentityServiceImpl;
  posts: PostServiceImpl;
  postReads: DrizzlePostRepository;
  discussion: DiscussionServiceImpl;
  discussionReads: DrizzleDiscussionRepository;
  chatReads: DrizzleChatRepository;
  runsRepo: DrizzleAutomationRunsRepository;
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

async function idsForRole(
  organizations: OrganizationServiceImpl,
  orgId: string,
  role: TeamRole,
): Promise<string[]> {
  const ids: string[] = [];
  let page = 1;
  for (;;) {
    const result = await organizations.listMembers(orgId, {
      page,
      pageSize: PAGE,
      role,
      status: 'active',
    });
    ids.push(...result.rows.map((row) => row.id));
    if (result.rows.length < PAGE) {
      return ids;
    }
    page += 1;
  }
}

export function communityMail(deps: Deps): {
  mail: CommunityMailReads;
  grants: GrantWriter;
  scheduledWork: ScheduledWork;
} {
  const mail: CommunityMailReads = {
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
      const orgUser = await deps.organizationsRepo.findOrgUserById(orgId, orgUserId);
      if (!orgUser) {
        return [];
      }
      const ids = await deps.entitlements.openSpaceIds(
        orgId,
        { id: orgUserId, role: orgUser.role },
        communityId,
      );
      const spaces = await Promise.all(ids.map((id) => deps.content.getSpace(orgId, id)));
      return spaces.flatMap((space) => (space ? [space.name] : []));
    },
    grantOpensCommunity(orgId, grant, communityId) {
      return deps.entitlements.grantOpensCommunity(orgId, grant, communityId);
    },
    async moderationAudience(orgId, communityId) {
      const staff = [
        ...(await idsForRole(deps.organizations, orgId, 'owner')),
        ...(await idsForRole(deps.organizations, orgId, 'admin')),
        ...(await idsForRole(deps.organizations, orgId, 'instructor')),
      ];
      const moderators = await idsForRole(deps.organizations, orgId, 'moderator');
      const granted: string[] = [];
      for (const id of moderators) {
        if (await deps.entitlementsRepo.hasCommunityAccess(orgId, id, communityId)) {
          granted.push(id);
        }
      }
      return [...new Set([...staff, ...granted])];
    },
    async staffIds(orgId) {
      return [
        ...(await idsForRole(deps.organizations, orgId, 'owner')),
        ...(await idsForRole(deps.organizations, orgId, 'admin')),
        ...(await idsForRole(deps.organizations, orgId, 'instructor')),
      ];
    },
    async displayName(orgId, orgUserId) {
      const orgUser = await deps.organizationsRepo.findOrgUserById(orgId, orgUserId);
      if (!orgUser) {
        return 'A member';
      }
      const [profile, user] = await Promise.all([
        deps.identity.getProfile(orgUser.userId),
        deps.identity.getUserById(orgUser.userId),
      ]);
      const named = profile?.displayName?.trim();
      if (named) {
        return named;
      }
      const composed = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim();
      return composed || 'A member';
    },
    followerIds(orgId, postId) {
      return deps.postReads.followerIds(orgId, postId);
    },
    async comment(orgId, commentId) {
      const comment = await deps.discussionReads.findComment(orgId, commentId);
      if (!comment) {
        return null;
      }
      return { orgUserId: comment.orgUserId, postId: comment.postId, body: comment.body };
    },
    async post(orgId, postId) {
      const post = await deps.postReads.find(orgId, postId);
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
      const chat = await deps.chatReads.findChat(orgId, chatId);
      if (!chat) {
        return null;
      }
      const participants = await deps.chatReads.participants(orgId, chatId);
      return {
        communityId: chat.communityId,
        kind: chat.kind,
        createdBy: chat.createdBy,
        participants: participants.map((participant) => ({
          orgUserId: participant.orgUserId,
          mutedUntil: participant.mutedUntil,
          leftAt: participant.leftAt,
        })),
      };
    },
    async latestMessageBody(orgId, chatId) {
      const page = await deps.chatReads.listMessages(orgId, chatId, { page: 1, pageSize: 1 });
      return page.rows[0]?.body ?? null;
    },
    pairBlocked(orgId, communityId, a, b) {
      return deps.chatReads.isBlocked(orgId, communityId, a, b);
    },
    async activeMemberCount(orgId, spaceId) {
      const rows = await deps.entitlementsRepo.listSpaceMembers(orgId, spaceId);
      return rows.filter((row) => row.status === 'active').length;
    },
    async memberCommunityTitles(orgId, orgUserId) {
      const titles: { id: string; title: string }[] = [];
      let page = 1;
      for (;;) {
        const result = await deps.content.listCommunities(orgId, { page, pageSize: PAGE });
        for (const community of result.rows) {
          if (await deps.entitlementsRepo.hasCommunityAccess(orgId, orgUserId, community.id)) {
            titles.push({ id: community.id, title: community.title });
          }
        }
        if (result.rows.length < PAGE) {
          return titles;
        }
        page += 1;
      }
    },
    recentMessageRecipients(orgId, automationId, chatId, since) {
      return deps.runsRepo.recentRecipients(orgId, automationId, chatId, since);
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
    },
  };
}
