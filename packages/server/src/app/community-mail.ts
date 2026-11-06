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
import { NotFoundError } from '@headless-lms/core/shared/errors';
import type { BodyParser } from '@headless-lms/core/shared/ports';

export type CommunityMailDeps = {
  content: Pick<
    ContentService,
    | 'findCommunity'
    | 'getSpace'
    | 'listCommunitiesById'
    | 'findCourse'
    | 'findDownload'
    | 'findBundle'
  >;
  entitlements: Pick<
    EntitlementsService,
    | 'openSpacesFor'
    | 'communitiesOpenedBy'
    | 'communityMembersAmong'
    | 'spaceOpenersAmong'
    | 'spaceOpeners'
    | 'countActiveSpaceMembers'
    | 'communityIdsOpenedFor'
    | 'ensureGrant'
  >;
  organizations: Pick<
    OrganizationService,
    | 'getById'
    | 'getOrgUserById'
    | 'actorFor'
    | 'systemActor'
    | 'holders'
    | 'getRole'
    | 'permissionsOfMany'
  >;
  identity: Pick<IdentityService, 'displayName'>;
  posts: Pick<PostService, 'find'>;
  subscriptions: Pick<SubscriptionService, 'followerIds' | 'itemSubscriptions'>;
  discussion: Pick<DiscussionService, 'getComment'>;
  chats: Pick<ChatService, 'chatSummary' | 'latestMessageBody' | 'isBlocked'>;
  bodies: BodyParser;
};

export function communityMail(deps: CommunityMailDeps): {
  mail: Omit<CommunityMailReads, 'recentMessageRecipients'>;
  grants: GrantWriter;
} {
  const system = (orgId: string) => deps.organizations.systemActor(orgId);
  const mail: Omit<CommunityMailReads, 'recentMessageRecipients'> = {
    async communityTitle(orgId, communityId) {
      return (await deps.content.findCommunity(communityId, system(orgId)))?.title ?? null;
    },
    async space(orgId, spaceId) {
      const space = await deps.content.getSpace(spaceId, system(orgId));
      return space
        ? { name: space.name, communityId: space.communityId, capacity: space.capacity }
        : null;
    },
    async openSpaceNames(orgId, orgUserId, communityId) {
      const person = await deps.organizations.actorFor(orgId, orgUserId);
      if (!person) {
        return [];
      }
      const spaces = await deps.entitlements.openSpacesFor(communityId, person);
      return spaces.map((space) => space.name);
    },
    communitiesOpenedBy: (orgId, grant) => deps.entitlements.communitiesOpenedBy(orgId, grant),
    communityMembersAmong: (orgId, communityId, ids) =>
      deps.entitlements.communityMembersAmong(orgId, communityId, ids),
    spaceOpenersAmong: (orgId, spaceId, ids) =>
      deps.entitlements.spaceOpenersAmong(orgId, spaceId, ids),
    spaceOpeners: (orgId, spaceId) => deps.entitlements.spaceOpeners(orgId, spaceId),
    holders: (orgId, permission, on) => deps.organizations.holders(orgId, permission, on),
    async heldOnOrg(orgId, orgUserId, permissions) {
      const held = (await deps.organizations.permissionsOfMany(orgId, [orgUserId])).get(orgUserId);
      return held ? permissions.filter((permission) => held.has(permission)) : [];
    },
    async role(orgId, roleKey) {
      try {
        const role = await deps.organizations.getRole(roleKey, system(orgId));
        return { name: role.name, permissions: role.permissions };
      } catch (err) {
        if (err instanceof NotFoundError) {
          return null;
        }
        throw err;
      }
    },
    async orgName(orgId) {
      return (await deps.organizations.getById(orgId))?.name ?? null;
    },
    async contentInfo(orgId, item) {
      const actor = system(orgId);
      if ('bundleId' in item) {
        const bundle = await deps.content.findBundle(item.bundleId, actor);
        return bundle ? { title: bundle.name, type: 'bundle' } : null;
      }
      const course = await deps.content.findCourse(item.contentId, actor);
      if (course) {
        return { title: course.title, type: course.type };
      }
      const download = await deps.content.findDownload(item.contentId, actor);
      if (download) {
        return { title: download.title, type: download.type };
      }
      const community = await deps.content.findCommunity(item.contentId, actor);
      return community ? { title: community.title, type: community.type } : null;
    },
    async displayName(orgId, orgUserId) {
      const orgUser = await deps.organizations.getOrgUserById(orgId, orgUserId);
      return deps.identity.displayName(orgUser?.userId ?? null);
    },
    postText: (body) => deps.bodies.parse(body).text,
    followerIds: (orgId, postId) => deps.subscriptions.followerIds(orgId, postId),
    async comment(orgId, commentId) {
      const comment = await deps.discussion.getComment(orgId, commentId);
      return comment
        ? {
            orgUserId: comment.orgUserId,
            postId: comment.postId,
            activityId: comment.activityId,
            parentId: comment.parentId,
            body: comment.body,
          }
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
      const communities = await deps.content.listCommunitiesById(ids, system(orgId));
      return communities.map((community) => ({ id: community.id, title: community.title }));
    },
  };
  return {
    mail,
    grants: {
      grant: (orgId, input) => deps.entitlements.ensureGrant(input, system(orgId)),
    },
  };
}
