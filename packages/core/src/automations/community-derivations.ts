import { discussionEvents } from '../discussion/index.js';
import { entitlementEvents } from '../entitlements/index.js';
import { organizationEvents } from '../organizations/index.js';
import type { EmailTemplateId } from '../types/index.js';
import type { DomainEvent } from '../shared/ports.js';
import {
  actorOf,
  address,
  excerpt,
  MESSAGE_BATCH_MS,
  MESSAGE_EXCERPT,
  POST_EXCERPT,
  previousStatusOf,
  seededCommunityId,
  type ActionDeps,
  type EmailRecipient,
} from './community-mail.js';

export interface EmailDerivation<K extends EmailTemplateId> {
  triggers: readonly string[];
  derive(event: DomainEvent, deps: ActionDeps): Promise<EmailRecipient<K>[] | undefined>;
}

function silence<K extends EmailTemplateId>(triggers: readonly string[]): EmailDerivation<K> {
  return { triggers, derive: async () => [] };
}

function seatsLeft(capacity: number | null, active: number): string {
  if (capacity == null) {
    return 'No cap';
  }
  return String(Math.max(capacity - active, 0));
}

function muted(until: Date | null, at: Date): boolean {
  return until != null && until.getTime() > at.getTime();
}

async function communityTitle(deps: ActionDeps, orgId: string, communityId: string) {
  return deps.mail.communityTitle(orgId, communityId);
}

export const COMMUNITY_DERIVATIONS: {
  [K in EmailTemplateId]?: EmailDerivation<K>;
} = {
  welcomeToCommunity: {
    triggers: ['entitlement.created'],
    derive: async (event, deps) => {
      const parsed = entitlementEvents.entitlementCreated.safeParse(event);
      const communityId = seededCommunityId(deps);
      if (!parsed.success || !communityId) {
        return parsed.success ? [] : undefined;
      }
      const grant = parsed.data.data;
      const opens = await deps.mail.grantOpensCommunity(
        event.orgId,
        { contentId: grant.contentId, bundleId: grant.bundleId },
        communityId,
      );
      if (!opens) {
        return [];
      }
      const title = await communityTitle(deps, event.orgId, communityId);
      if (!title) {
        return undefined;
      }
      const spaceNames = await deps.mail.openSpaceNames(event.orgId, grant.orgUserId, communityId);
      return address(deps, event, event.orgId, [grant.orgUserId], {
        communityTitle: title,
        communityId,
        spaceNames,
      });
    },
  },
  membershipEndingSoon: {
    triggers: ['entitlement.ending_soon'],
    derive: async (event, deps) => {
      const parsed = entitlementEvents.entitlementEndingSoon.safeParse(event);
      if (!parsed.success) {
        return undefined;
      }
      const grant = parsed.data.data;
      const communityId = grant.communityId;
      const title = await communityTitle(deps, event.orgId, communityId);
      if (!title) {
        return undefined;
      }
      return address(deps, event, event.orgId, [grant.orgUserId], {
        communityTitle: title,
        communityId,
        expiresAt: grant.expiresAt ? grant.expiresAt.toISOString() : '',
      });
    },
  },
  membershipEnded: {
    triggers: ['entitlement.expired', 'entitlement.deleted'],
    derive: async (event, deps) => {
      const parsed =
        event.type === 'entitlement.expired'
          ? entitlementEvents.entitlementExpired.safeParse(event)
          : entitlementEvents.entitlementDeleted.safeParse(event);
      const communityId = seededCommunityId(deps);
      if (!parsed.success || !communityId) {
        return parsed.success ? [] : undefined;
      }
      const grant = parsed.data.data;
      const opens = await deps.mail.grantOpensCommunity(
        event.orgId,
        { contentId: grant.contentId, bundleId: grant.bundleId },
        communityId,
      );
      if (!opens) {
        return [];
      }
      const title = await communityTitle(deps, event.orgId, communityId);
      if (!title) {
        return undefined;
      }
      return address(deps, event, event.orgId, [grant.orgUserId], {
        communityTitle: title,
        communityId,
      });
    },
  },
  newPostInSpace: silence(['discussion.post.published']),
  yourPostWasPublished: {
    triggers: ['discussion.post.published'],
    derive: async (event, deps) => {
      if (previousStatusOf(event) !== 'pending') {
        return [];
      }
      const parsed = discussionEvents.postPublished.safeParse(event);
      if (!parsed.success) {
        return undefined;
      }
      const post = parsed.data.data;
      const space = await deps.mail.space(event.orgId, post.spaceId);
      if (!space) {
        return undefined;
      }
      return address(deps, event, event.orgId, [post.orgUserId], {
        postTitle: post.title,
        spaceName: space.name,
        postId: post.id,
        communityId: post.communityId,
      });
    },
  },
  yourPostWasRemoved: {
    triggers: ['discussion.post.removed'],
    derive: async (event, deps) => {
      const parsed = discussionEvents.postRemoved.safeParse(event);
      if (!parsed.success) {
        return undefined;
      }
      const post = parsed.data.data;
      if (post.removedBy === post.orgUserId) {
        return [];
      }
      const space = await deps.mail.space(event.orgId, post.spaceId);
      if (!space) {
        return undefined;
      }
      return address(deps, event, event.orgId, [post.orgUserId], {
        postTitle: post.title,
        spaceName: space.name,
        spaceId: post.spaceId,
        communityId: post.communityId,
      });
    },
  },
  newCommentOnPost: {
    triggers: ['discussion.comment.created'],
    derive: async (event, deps) => {
      const parsed = discussionEvents.commentCreated.safeParse(event);
      if (!parsed.success) {
        return undefined;
      }
      const comment = parsed.data.data;
      if (!comment.postId || comment.status !== 'published' || !comment.communityId) {
        return [];
      }
      const post = await deps.mail.post(event.orgId, comment.postId);
      if (!post) {
        return undefined;
      }
      const followers = await deps.mail.followerIds(event.orgId, comment.postId);
      const ids = [...new Set([...followers, post.orgUserId])].filter(
        (id) => id !== comment.orgUserId,
      );
      return address(deps, event, event.orgId, ids, {
        postTitle: post.title,
        commenterName: await deps.mail.displayName(event.orgId, comment.orgUserId),
        excerpt: excerpt(comment.body, POST_EXCERPT),
        commentId: comment.id,
        postId: comment.postId,
        communityId: comment.communityId,
      });
    },
  },
  replyToYourComment: {
    triggers: ['discussion.comment.created'],
    derive: async (event, deps) => {
      const parsed = discussionEvents.commentCreated.safeParse(event);
      if (!parsed.success) {
        return undefined;
      }
      const comment = parsed.data.data;
      if (!comment.parentId || !comment.postId || comment.status !== 'published') {
        return [];
      }
      const parent = await deps.mail.comment(event.orgId, comment.parentId);
      const post = await deps.mail.post(event.orgId, comment.postId);
      if (!parent || !post || !comment.communityId) {
        return parent && post ? [] : undefined;
      }
      if (parent.orgUserId === comment.orgUserId) {
        return [];
      }
      return address(deps, event, event.orgId, [parent.orgUserId], {
        postTitle: post.title,
        commenterName: await deps.mail.displayName(event.orgId, comment.orgUserId),
        excerpt: excerpt(comment.body, POST_EXCERPT),
        commentId: comment.id,
        postId: comment.postId,
        communityId: comment.communityId,
      });
    },
  },
  yourCommentWasRemoved: {
    triggers: ['discussion.comment.removed'],
    derive: async (event, deps) => {
      const parsed = discussionEvents.commentRemoved.safeParse(event);
      if (!parsed.success) {
        return undefined;
      }
      const comment = parsed.data.data;
      if (!comment.postId || !comment.communityId) {
        return [];
      }
      if (comment.removedBy === comment.orgUserId) {
        return [];
      }
      const post = await deps.mail.post(event.orgId, comment.postId);
      if (!post) {
        return undefined;
      }
      return address(deps, event, event.orgId, [comment.orgUserId], {
        postTitle: post.title,
        postId: comment.postId,
        communityId: comment.communityId,
      });
    },
  },
  postAwaitingReview: {
    triggers: ['discussion.post.created', 'discussion.post.updated'],
    derive: async (event, deps) => {
      const parsed =
        event.type === 'discussion.post.created'
          ? discussionEvents.postCreated.safeParse(event)
          : discussionEvents.postUpdated.safeParse(event);
      if (!parsed.success) {
        return undefined;
      }
      const post = parsed.data.data;
      if (post.status !== 'pending' || previousStatusOf(event) === 'pending') {
        return [];
      }
      const space = await deps.mail.space(event.orgId, post.spaceId);
      if (!space) {
        return undefined;
      }
      const audience = await deps.mail.moderationAudience(event.orgId, post.communityId);
      return address(deps, event, event.orgId, audience, {
        spaceName: space.name,
        postTitle: post.title,
        authorName: await deps.mail.displayName(event.orgId, post.orgUserId),
        spaceId: post.spaceId,
        communityId: post.communityId,
      });
    },
  },
  joinRequest: {
    triggers: ['entitlement.space_member.created'],
    derive: async (event, deps) => {
      const parsed = entitlementEvents.spaceMemberCreated.safeParse(event);
      if (!parsed.success) {
        return undefined;
      }
      const member = parsed.data.data;
      if (member.status !== 'requested') {
        return [];
      }
      const space = await deps.mail.space(event.orgId, member.spaceId);
      if (!space) {
        return undefined;
      }
      const active = await deps.mail.activeMemberCount(event.orgId, member.spaceId);
      const audience = await deps.mail.moderationAudience(event.orgId, member.communityId);
      return address(deps, event, event.orgId, audience, {
        spaceName: space.name,
        memberName: await deps.mail.displayName(event.orgId, member.orgUserId),
        seatsLeft: seatsLeft(space.capacity, active),
        spaceId: member.spaceId,
        communityId: member.communityId,
      });
    },
  },
  requestApproved: {
    triggers: ['entitlement.space_member.updated'],
    derive: async (event, deps) => {
      const parsed = entitlementEvents.spaceMemberUpdated.safeParse(event);
      if (!parsed.success) {
        return undefined;
      }
      const member = parsed.data.data;
      if (member.status !== 'active' || previousStatusOf(event) !== 'requested') {
        return [];
      }
      const space = await deps.mail.space(event.orgId, member.spaceId);
      if (!space) {
        return undefined;
      }
      return address(deps, event, event.orgId, [member.orgUserId], {
        spaceName: space.name,
        spaceId: member.spaceId,
        communityId: member.communityId,
      });
    },
  },
  requestDeclined: {
    triggers: ['entitlement.space_member.deleted'],
    derive: async (event, deps) => {
      if (previousStatusOf(event) !== 'requested') {
        return [];
      }
      const parsed = entitlementEvents.spaceMemberDeleted.safeParse(event);
      if (!parsed.success) {
        return undefined;
      }
      const member = parsed.data.data;
      const space = await deps.mail.space(event.orgId, member.spaceId);
      if (!space) {
        return undefined;
      }
      return address(deps, event, event.orgId, [member.orgUserId], {
        spaceName: space.name,
        communityId: member.communityId,
      });
    },
  },
  invitedToSpace: {
    triggers: ['entitlement.space_member.created'],
    derive: async (event, deps) => {
      const parsed = entitlementEvents.spaceMemberCreated.safeParse(event);
      if (!parsed.success) {
        return undefined;
      }
      const member = parsed.data.data;
      if (member.status !== 'invited') {
        return [];
      }
      const space = await deps.mail.space(event.orgId, member.spaceId);
      if (!space) {
        return undefined;
      }
      const actor = actorOf(event);
      return address(deps, event, event.orgId, [member.orgUserId], {
        spaceName: space.name,
        inviterName: actor ? await deps.mail.displayName(event.orgId, actor) : 'A member',
        spaceId: member.spaceId,
        communityId: member.communityId,
      });
    },
  },
  messageRequest: {
    triggers: ['discussion.chat.created'],
    derive: async (event, deps) => {
      const parsed = discussionEvents.chatCreated.safeParse(event);
      if (!parsed.success) {
        return undefined;
      }
      const chat = parsed.data.data;
      if (chat.kind !== 'direct' || chat.status !== 'pending') {
        return [];
      }
      const recipient = chat.participantIds.find((id) => id !== chat.createdBy);
      if (!recipient) {
        return [];
      }
      const body = await deps.mail.latestMessageBody(event.orgId, chat.id);
      return address(deps, event, event.orgId, [recipient], {
        senderName: await deps.mail.displayName(event.orgId, chat.createdBy),
        excerpt: excerpt(body ?? '', MESSAGE_EXCERPT),
        chatId: chat.id,
        communityId: chat.communityId,
      });
    },
  },
  newMessage: {
    triggers: ['discussion.message.sent'],
    derive: async (event, deps) => {
      const parsed = discussionEvents.messageSent.safeParse(event);
      if (!parsed.success) {
        return undefined;
      }
      const message = parsed.data.data;
      const chat = await deps.mail.chat(event.orgId, message.chatId);
      if (!chat) {
        return undefined;
      }
      const at = new Date(event.occurredAt);
      const since = new Date(at.getTime() - MESSAGE_BATCH_MS);
      const recent = new Set(
        await deps.mail.recentMessageRecipients(
          event.orgId,
          deps.automationId,
          message.chatId,
          since,
        ),
      );
      const ids: string[] = [];
      for (const participant of chat.participants) {
        if (participant.leftAt || participant.orgUserId === message.orgUserId) {
          continue;
        }
        if (muted(participant.mutedUntil, at) || recent.has(participant.orgUserId)) {
          continue;
        }
        if (
          await deps.mail.pairBlocked(
            event.orgId,
            chat.communityId,
            message.orgUserId,
            participant.orgUserId,
          )
        ) {
          continue;
        }
        ids.push(participant.orgUserId);
      }
      const title =
        chat.kind === 'direct'
          ? await deps.mail.displayName(event.orgId, message.orgUserId)
          : await groupTitle(deps, event.orgId, chat.participants);
      return address(deps, event, event.orgId, ids, {
        senderName: await deps.mail.displayName(event.orgId, message.orgUserId),
        chatTitle: title,
        excerpt: excerpt(message.body, MESSAGE_EXCERPT),
        chatId: message.chatId,
        communityId: message.communityId,
      });
    },
  },
  addedToGroupChat: {
    triggers: ['discussion.chat.participant.added'],
    derive: async (event, deps) => {
      const parsed = discussionEvents.chatParticipantAdded.safeParse(event);
      if (!parsed.success) {
        return undefined;
      }
      const added = parsed.data.data;
      const chat = await deps.mail.chat(event.orgId, added.chatId);
      if (!chat) {
        return undefined;
      }
      return address(deps, event, event.orgId, [added.orgUserId], {
        adderName: await deps.mail.displayName(event.orgId, added.addedBy),
        participantNames: await participantNames(deps, event.orgId, chat.participants),
        chatId: added.chatId,
        communityId: added.communityId,
      });
    },
  },
  youAreNowAModerator: {
    triggers: ['organization.user.updated'],
    derive: async (event, deps) => {
      const parsed = organizationEvents.orgUserUpdated.safeParse(event);
      if (!parsed.success) {
        return undefined;
      }
      const orgUser = parsed.data.data;
      if (orgUser.role !== 'moderator') {
        return [];
      }
      const communities = await deps.mail.memberCommunityTitles(event.orgId, orgUser.id);
      return address(deps, event, event.orgId, [orgUser.id], {
        communityTitles: communities.map((community) => community.title),
      });
    },
  },
  digest: silence(['discussion.digest.due']),
  somethingWasFlagged: {
    triggers: ['discussion.post.reported', 'discussion.comment.reported'],
    derive: async (event, deps) => {
      if (event.type === 'discussion.post.reported') {
        const parsed = discussionEvents.postReported.safeParse(event);
        if (!parsed.success) {
          return undefined;
        }
        const flag = parsed.data.data;
        const post = await deps.mail.post(event.orgId, flag.postId);
        const space = post ? await deps.mail.space(event.orgId, post.spaceId) : null;
        if (!post || !space) {
          return undefined;
        }
        const audience = await deps.mail.moderationAudience(event.orgId, flag.communityId);
        return address(deps, event, event.orgId, audience, {
          spaceName: space.name,
          excerpt: excerpt(post.body || post.title, POST_EXCERPT),
          reason: flag.reason,
          spaceId: post.spaceId,
          communityId: flag.communityId,
        });
      }
      const parsed = discussionEvents.commentReported.safeParse(event);
      if (!parsed.success) {
        return undefined;
      }
      const flag = parsed.data.data;
      if (!flag.communityId) {
        return [];
      }
      const comment = await deps.mail.comment(event.orgId, flag.commentId);
      if (!comment?.postId) {
        return comment ? [] : undefined;
      }
      const post = await deps.mail.post(event.orgId, comment.postId);
      const space = post ? await deps.mail.space(event.orgId, post.spaceId) : null;
      if (!post || !space) {
        return undefined;
      }
      const audience = await deps.mail.moderationAudience(event.orgId, flag.communityId);
      return address(deps, event, event.orgId, audience, {
        spaceName: space.name,
        excerpt: excerpt(comment.body, POST_EXCERPT),
        reason: flag.reason,
        spaceId: post.spaceId,
        communityId: flag.communityId,
      });
    },
  },
  messageWasFlagged: {
    triggers: ['discussion.message.reported'],
    derive: async (event, deps) => {
      const parsed = discussionEvents.messageReported.safeParse(event);
      if (!parsed.success) {
        return undefined;
      }
      const flag = parsed.data.data;
      const audience = await deps.mail.staffIds(event.orgId);
      return address(deps, event, event.orgId, audience, {
        reason: flag.reason,
        communityId: flag.communityId,
      });
    },
  },
};

async function participantNames(
  deps: ActionDeps,
  orgId: string,
  participants: { orgUserId: string; leftAt: Date | null }[],
): Promise<string[]> {
  const names: string[] = [];
  for (const participant of participants) {
    if (participant.leftAt) {
      continue;
    }
    names.push(await deps.mail.displayName(orgId, participant.orgUserId));
  }
  return names;
}

async function groupTitle(
  deps: ActionDeps,
  orgId: string,
  participants: { orgUserId: string; leftAt: Date | null }[],
): Promise<string> {
  const names = await participantNames(deps, orgId, participants);
  return names.length > 0 ? names.join(', ') : 'Group chat';
}
