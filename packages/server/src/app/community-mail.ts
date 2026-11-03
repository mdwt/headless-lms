import type { CommunityMailReads, GrantWriter } from '@headless-lms/core/automations';
import type { ContentService } from '@headless-lms/core/content';
import type {
  ChatService,
  DiscussionService,
  PostService,
  SubscriptionService,
} from '@headless-lms/core/discussion';
import type { EntitlementsService } from '@headless-lms/core/entitlements';
import type { IdentityService } from '@headless-lms/core/identity';
import type { OrganizationService } from '@headless-lms/core/organizations';

export type CommunityMailDeps = {
  content: Pick<ContentService, 'getCommunity' | 'getSpace' | 'listCommunitiesById'>;
  entitlements: Pick<
    EntitlementsService,
    | 'openSpacesFor'
    | 'communitiesOpenedBy'
    | 'communityMembersAmong'
    | 'spaceOpenersAmong'
    | 'spaceOpeners'
    | 'communityModeratorIds'
    | 'countActiveSpaceMembers'
    | 'communityIdsOpenedFor'
    | 'ensureGrant'
  >;
  organizations: Pick<OrganizationService, 'getOrgUserById' | 'staffOrgUserIds'>;
  identity: Pick<IdentityService, 'displayName'>;
  posts: Pick<PostService, 'find'>;
  subscriptions: Pick<SubscriptionService, 'followerIds' | 'itemSubscriptions'>;
  discussion: Pick<DiscussionService, 'getComment'>;
  chats: Pick<ChatService, 'chatSummary' | 'latestMessageBody' | 'isBlocked'>;
};

export function communityMail(deps: CommunityMailDeps): {
  mail: Omit<CommunityMailReads, 'recentMessageRecipients'>;
  grants: GrantWriter;
} {
  const mail: Omit<CommunityMailReads, 'recentMessageRecipients'> = {
    async communityTitle(orgId, communityId) {
      return (await deps.content.getCommunity(orgId, communityId))?.title ?? null;
    },
    async space(orgId, spaceId) {
      const space = await deps.content.getSpace(orgId, spaceId);
      return space
        ? { name: space.name, communityId: space.communityId, capacity: space.capacity }
        : null;
    },
    async openSpaceNames(orgId, orgUserId, communityId) {
      const orgUser = await deps.organizations.getOrgUserById(orgId, orgUserId);
      if (!orgUser) {
        return [];
      }
      const spaces = await deps.entitlements.openSpacesFor(
        orgId,
        { id: orgUser.id, role: orgUser.role },
        communityId,
      );
      return spaces.map((space) => space.name);
    },
    communitiesOpenedBy: (orgId, grant) => deps.entitlements.communitiesOpenedBy(orgId, grant),
    communityMembersAmong: (orgId, communityId, ids) =>
      deps.entitlements.communityMembersAmong(orgId, communityId, ids),
    spaceOpenersAmong: (orgId, spaceId, ids) =>
      deps.entitlements.spaceOpenersAmong(orgId, spaceId, ids),
    spaceOpeners: (orgId, spaceId) => deps.entitlements.spaceOpeners(orgId, spaceId),
    moderationAudience: (orgId, communityId) =>
      deps.entitlements.communityModeratorIds(orgId, communityId),
    staffIds: (orgId) => deps.organizations.staffOrgUserIds(orgId),
    async displayName(orgId, orgUserId) {
      const orgUser = await deps.organizations.getOrgUserById(orgId, orgUserId);
      return deps.identity.displayName(orgUser?.userId ?? null);
    },
    followerIds: (orgId, postId) => deps.subscriptions.followerIds(orgId, postId),
    async comment(orgId, commentId) {
      const comment = await deps.discussion.getComment(orgId, commentId);
      return comment
        ? { orgUserId: comment.orgUserId, postId: comment.postId, body: comment.body }
        : null;
    },
    async post(orgId, postId) {
      const post = await deps.posts.find(orgId, postId);
      return post
        ? {
            title: post.title,
            body: post.body,
            spaceId: post.spaceId,
            orgUserId: post.orgUserId,
            communityId: post.communityId,
          }
        : null;
    },
    async chat(orgId, chatId) {
      const summary = await deps.chats.chatSummary(orgId, chatId);
      if (!summary) {
        return null;
      }
      const mutes = new Map(
        (await deps.subscriptions.itemSubscriptions(orgId, { type: 'chat', id: chatId }))
          .filter((subscription) => subscription.state === 'muted')
          .map((subscription) => [subscription.orgUserId, subscription.mutedUntil]),
      );
      return {
        communityId: summary.chat.communityId,
        kind: summary.chat.kind,
        status: summary.chat.status,
        createdBy: summary.chat.createdBy,
        participants: summary.participants.map((participant) => ({
          orgUserId: participant.orgUserId,
          muted: mutes.has(participant.orgUserId),
          mutedUntil: mutes.get(participant.orgUserId) ?? null,
          leftAt: participant.leftAt,
        })),
      };
    },
    latestMessageBody: (orgId, chatId) => deps.chats.latestMessageBody(orgId, chatId),
    pairBlocked: (orgId, communityId, a, b) => deps.chats.isBlocked(orgId, communityId, a, b),
    activeMemberCount: (orgId, spaceId) =>
      deps.entitlements.countActiveSpaceMembers(orgId, spaceId),
    async memberCommunityTitles(orgId, orgUserId) {
      const ids = await deps.entitlements.communityIdsOpenedFor(orgId, orgUserId);
      const communities = await deps.content.listCommunitiesById(orgId, ids);
      return communities.map((community) => ({ id: community.id, title: community.title }));
    },
  };
  return {
    mail,
    grants: {
      grant: (orgId, input) => deps.entitlements.ensureGrant(orgId, input),
    },
  };
}
