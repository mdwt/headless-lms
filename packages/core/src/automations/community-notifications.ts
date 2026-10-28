import type { NewNotification } from '../identity/index.js';
import type { NotificationKind } from '../types/index.js';
import type { DomainEvent } from '../shared/ports.js';
import { actorOf, type ActionDeps, type EmailRecipient } from './community-mail.js';

type Placement = Omit<NewNotification, 'userId' | 'kind'>;

export interface NotificationPlacement<K extends NotificationKind> {
  place(event: DomainEvent, recipient: EmailRecipient<K>, deps: ActionDeps): Promise<Placement[]>;
}

type About = Partial<Pick<Placement, 'spaceId' | 'postId' | 'commentId' | 'chatId' | 'messageId'>>;

function text(event: DomainEvent, key: string): string | null {
  if (typeof event.data !== 'object' || event.data === null) {
    return null;
  }
  const value = (event.data as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : null;
}

function at(communityId: string | null, actorOrgUserId: string | null, about: About): Placement[] {
  return [
    {
      communityId,
      actorOrgUserId,
      spaceId: about.spaceId ?? null,
      postId: about.postId ?? null,
      commentId: about.commentId ?? null,
      chatId: about.chatId ?? null,
      messageId: about.messageId ?? null,
    },
  ];
}

function actor(event: DomainEvent): string | null {
  return actorOf(event) ?? null;
}

async function spaceOfPost(
  deps: ActionDeps,
  event: DomainEvent,
  postId: string | null,
): Promise<string | null> {
  return postId ? ((await deps.mail.post(event.orgId, postId))?.spaceId ?? null) : null;
}

export const NOTIFICATION_PLACEMENTS: {
  [K in NotificationKind]: NotificationPlacement<K>;
} = {
  newPostInSpace: {
    place: async (event, { params }) =>
      at(params.communityId, text(event, 'orgUserId'), {
        postId: params.postId,
        spaceId: text(event, 'spaceId'),
      }),
  },
  newCommentOnPost: {
    place: async (event, { params }, deps) =>
      at(params.communityId, text(event, 'orgUserId'), {
        postId: params.postId,
        commentId: params.commentId,
        spaceId: await spaceOfPost(deps, event, params.postId),
      }),
  },
  replyToYourComment: {
    place: async (event, { params }, deps) =>
      at(params.communityId, text(event, 'orgUserId'), {
        postId: params.postId,
        commentId: params.commentId,
        spaceId: await spaceOfPost(deps, event, params.postId),
      }),
  },
  yourPostWasPublished: {
    place: async (event, { params }) =>
      at(params.communityId, actor(event), {
        postId: params.postId,
        spaceId: text(event, 'spaceId'),
      }),
  },
  yourPostWasRemoved: {
    place: async (event, { params }) =>
      at(params.communityId, text(event, 'removedBy'), {
        postId: text(event, 'id'),
        spaceId: params.spaceId,
      }),
  },
  yourCommentWasRemoved: {
    place: async (event, { params }, deps) =>
      at(params.communityId, text(event, 'removedBy'), {
        postId: params.postId,
        commentId: text(event, 'id'),
        spaceId: await spaceOfPost(deps, event, params.postId),
      }),
  },
  requestApproved: {
    place: async (event, { params }) =>
      at(params.communityId, actor(event), { spaceId: params.spaceId }),
  },
  requestDeclined: {
    place: async (event, { params }) =>
      at(params.communityId, actor(event), { spaceId: text(event, 'spaceId') }),
  },
  invitedToSpace: {
    place: async (event, { params }) =>
      at(params.communityId, actor(event), { spaceId: params.spaceId }),
  },
  newMessage: {
    place: async (event, { params }) =>
      at(params.communityId, text(event, 'orgUserId'), {
        chatId: params.chatId,
        messageId: text(event, 'id'),
      }),
  },
  messageRequest: {
    place: async (event, { params }) =>
      at(params.communityId, text(event, 'createdBy'), { chatId: params.chatId }),
  },
  addedToGroupChat: {
    place: async (event, { params }) =>
      at(params.communityId, text(event, 'addedBy'), { chatId: params.chatId }),
  },
  youAreNowAModerator: {
    place: async (event) => at(null, actor(event), {}),
  },
  membershipEndingSoon: {
    place: async (_event, { params }) => at(params.communityId, null, {}),
  },
  welcomeToCommunity: {
    place: async (event, { params }) => at(params.communityId, actor(event), {}),
  },
  postAwaitingReview: {
    place: async (event, { params }) =>
      at(params.communityId, text(event, 'orgUserId'), {
        postId: text(event, 'id'),
        spaceId: params.spaceId,
      }),
  },
  joinRequest: {
    place: async (event, { params }) =>
      at(params.communityId, text(event, 'orgUserId'), { spaceId: params.spaceId }),
  },
  somethingWasFlagged: {
    place: async (event, { params }, deps) => {
      const commentId = text(event, 'commentId');
      const postId = commentId
        ? ((await deps.mail.comment(event.orgId, commentId))?.postId ?? null)
        : text(event, 'postId');
      return at(params.communityId, text(event, 'orgUserId'), {
        spaceId: params.spaceId,
        postId,
        commentId,
      });
    },
  },
  messageWasFlagged: {
    place: async (event, { params }) =>
      at(params.communityId, text(event, 'orgUserId'), { messageId: text(event, 'messageId') }),
  },
};
