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
  content: Pick<
    ContentService,
    'getActivity' | 'getModule' | 'getCourse' | 'getDownload' | 'getBundle'
  >;
  entitlements: Pick<EntitlementsService, 'communityMemberIds' | 'contentHolderIds'>;
  organizations: Pick<OrganizationService, 'getOrgUsersByIds'>;
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
    async activity(orgId, activityId) {
      const activity = await deps.content.getActivity(orgId, activityId);
      if (!activity) {
        return null;
      }
      const [module, course] = await Promise.all([
        deps.content.getModule(orgId, activity.moduleId),
        deps.content.getCourse(orgId, activity.courseId),
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
    async contentInfo(orgId, item) {
      if ('bundleId' in item) {
        const bundle = await deps.content.getBundle(orgId, item.bundleId);
        return bundle ? { title: bundle.name, type: 'bundle' } : null;
      }
      const course = await deps.content.getCourse(orgId, item.contentId);
      if (course) {
        return { title: course.title, type: course.type };
      }
      const download = await deps.content.getDownload(orgId, item.contentId);
      if (download) {
        return { title: download.title, type: download.type };
      }
      const community = await deps.content.getCommunity(orgId, item.contentId);
      return community ? { title: community.title, type: community.type } : null;
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
