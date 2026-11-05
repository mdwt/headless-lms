import type { NotificationReads } from '@headless-lms/core/automations';
import { activityTitle, type ContentService } from '@headless-lms/core/content';
import type {
  ChatService,
  DiscussionService,
  PostService,
  SubscriptionService,
} from '@headless-lms/core/discussion';
import type { EntitlementsService } from '@headless-lms/core/entitlements';
import type { IdentityService, NotificationSettingsService } from '@headless-lms/core/identity';
import type { OrganizationService } from '@headless-lms/core/organizations';
import { communityMail, type CommunityMailDeps } from './community-mail.js';

export type NotificationReadsDeps = CommunityMailDeps & {
  content: Pick<ContentService, 'getActivity' | 'getModule' | 'findCourse' | 'listBundleItems'>;
  entitlements: Pick<EntitlementsService, 'communityMemberIds' | 'contentHolderIds' | 'hasAccess'>;
  organizations: Pick<OrganizationService, 'getOrgUsersByIds' | 'systemActor'>;
  identity: Pick<IdentityService, 'getUserById'>;
  posts: Pick<PostService, 'publishedBetween'>;
  subscriptions: Pick<SubscriptionService, 'mutedAmong'>;
  discussion: Pick<DiscussionService, 'commenterIds'>;
  chats: Pick<ChatService, 'unreadInChat' | 'findMessage'>;
  settings: Pick<NotificationSettingsService, 'switchedOn'>;
};

export function notificationReads(deps: NotificationReadsDeps): NotificationReads {
  const { mail } = communityMail(deps);
  const nameOf = (orgId: string, orgUserId: string) => mail.displayName(orgId, orgUserId);
  const system = (orgId: string) => deps.organizations.systemActor(orgId);
  return {
    ...mail,
    async threadParticipants(orgId, item) {
      if (item.type === 'post') {
        return deps.discussion.commenterIds(orgId, { postId: item.id });
      }
      if (item.type === 'activity') {
        return deps.discussion.commenterIds(orgId, { activityId: item.id });
      }
      return [];
    },
    mutedAmong: (orgId, item, orgUserIds, at) =>
      deps.subscriptions.mutedAmong(orgId, item, orgUserIds, at),
    communityMembers: (orgId, communityId) =>
      deps.entitlements.communityMemberIds(orgId, communityId),
    switchedOn: (orgId, communityId, category, spaceId) =>
      deps.settings.switchedOn(orgId, communityId, category, spaceId),
    courseHolders: (orgId, courseId) => deps.entitlements.contentHolderIds(orgId, courseId),
    async contentLostBy(orgId, grant) {
      const opened = grant.bundleId
        ? (await deps.content.listBundleItems(grant.bundleId, system(orgId))).map(
            (item) => item.contentId,
          )
        : grant.contentId
          ? [grant.contentId]
          : [];
      const held = await Promise.all(
        opened.map((contentId) => deps.entitlements.hasAccess(orgId, grant.orgUserId, contentId)),
      );
      return opened.filter((_, index) => !held[index]);
    },
    async activity(orgId, activityId) {
      const activity = await deps.content.getActivity(activityId, system(orgId));
      if (!activity) {
        return null;
      }
      const [module, course] = await Promise.all([
        deps.content.getModule(activity.moduleId, system(orgId)),
        deps.content.findCourse(activity.courseId, system(orgId)),
      ]);
      if (!course) {
        return null;
      }
      return {
        title: activityTitle(activity),
        moduleTitle: module?.title ?? '',
        courseId: course.id,
        courseTitle: course.title,
      };
    },
    async userIdsOf(orgId, orgUserIds) {
      const orgUsers = await deps.organizations.getOrgUsersByIds(orgId, orgUserIds);
      return Object.fromEntries(orgUsers.map((orgUser) => [orgUser.id, orgUser.userId]));
    },
    async emailOf(_orgId, userId) {
      return (await deps.identity.getUserById(userId))?.email ?? null;
    },
    async message(orgId, messageId) {
      const message = await deps.chats.findMessage(orgId, messageId);
      return message && message.deletedAt === null
        ? { orgUserId: message.orgUserId, chatId: message.chatId, body: message.body }
        : null;
    },
    async postsPublished(orgId, communityId, from, to) {
      const posts = await deps.posts.publishedBetween(orgId, communityId, from, to);
      const spaceNames = new Map<string, string>();
      for (const spaceId of new Set(posts.map((post) => post.spaceId))) {
        spaceNames.set(spaceId, (await mail.space(orgId, spaceId))?.name ?? '');
      }
      const authorNames = new Map<string, string>();
      for (const orgUserId of new Set(posts.map((post) => post.orgUserId))) {
        authorNames.set(orgUserId, await nameOf(orgId, orgUserId));
      }
      return posts.map((post) => ({
        postId: post.postId,
        spaceId: post.spaceId,
        title: post.title,
        authorName: authorNames.get(post.orgUserId) ?? '',
        spaceName: spaceNames.get(post.spaceId) ?? '',
        commentCount: post.commentCount,
      }));
    },
    unreadInChat: (orgId, chatId, orgUserId) => deps.chats.unreadInChat(orgId, chatId, orgUserId),
  };
}
