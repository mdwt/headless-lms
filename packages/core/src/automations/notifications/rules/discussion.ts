import { discussionEvents } from '../../../discussion/index.js';
import type { DomainEvent } from '../../../shared/ports.js';
import type { JsonValue, RecipientList, SubjectRef } from '../../../types/index.js';
import {
  communityModerators,
  MESSAGE_EXCERPT,
  POST_EXCERPT,
  previousStatusOf,
} from '../../community-mail.js';
import type { NotificationReads, RecipientRule } from '../../ports.js';
import {
  actorOr,
  chatReach,
  chatTitle,
  eventAt,
  listOf,
  participantNames,
  Reasons,
  recipientsOf,
  textExcerpt,
  type ListBase,
  type Reach,
} from './recipients.js';

type Post = NonNullable<Awaited<ReturnType<NotificationReads['post']>>>;
type Activity = NonNullable<Awaited<ReturnType<NotificationReads['activity']>>>;

type Place =
  | { kind: 'post'; postId: string; post: Post; spaceName: string }
  | { kind: 'activity'; activityId: string; activity: Activity };

const CHAT_STATUS = 'chatStatus';

function postReach(
  reads: NotificationReads,
  orgId: string,
  post: { id: string; spaceId: string },
  exclude: (string | null)[],
  at: Date,
): Reach {
  return {
    exclude,
    at,
    canOpen: (orgUserIds) => reads.spaceOpenersAmong(orgId, post.spaceId, orgUserIds),
    mutedOn: [
      { type: 'post', id: post.id },
      { type: 'space', id: post.spaceId },
    ],
  };
}

function courseReach(
  reads: NotificationReads,
  orgId: string,
  courseId: string,
  exclude: (string | null)[],
  at: Date,
): Reach {
  return {
    exclude,
    at,
    canOpen: async (orgUserIds) => {
      const [holders, readers] = await Promise.all([
        reads.courseHolders(orgId, courseId),
        reads.holders(orgId, 'courses:read', courseId),
      ]);
      const open = new Set([...holders, ...readers]);
      return orgUserIds.filter((orgUserId) => open.has(orgUserId));
    },
  };
}

async function placeOf(
  reads: NotificationReads,
  orgId: string,
  comment: { postId: string | null; activityId: string | null },
): Promise<Place | null> {
  if (comment.postId) {
    const post = await reads.post(orgId, comment.postId);
    const space = post ? await reads.space(orgId, post.spaceId) : null;
    return post && space
      ? { kind: 'post', postId: comment.postId, post, spaceName: space.name }
      : null;
  }
  if (comment.activityId) {
    const activity = await reads.activity(orgId, comment.activityId);
    return activity ? { kind: 'activity', activityId: comment.activityId, activity } : null;
  }
  return null;
}

function placeReach(
  reads: NotificationReads,
  orgId: string,
  place: Place,
  exclude: (string | null)[],
  at: Date,
): Reach {
  return place.kind === 'post'
    ? postReach(reads, orgId, { id: place.postId, spaceId: place.post.spaceId }, exclude, at)
    : courseReach(reads, orgId, place.activity.courseId, exclude, at);
}

function commentBase(
  type: string,
  place: Place,
  commentId: string,
  actorOrgUserId: string | null,
  display: Record<string, JsonValue>,
): ListBase {
  const subject: SubjectRef = { type: 'comment', id: commentId };
  if (place.kind === 'post') {
    return {
      type,
      scope: 'space',
      actorOrgUserId,
      communityId: place.post.communityId,
      spaceId: place.post.spaceId,
      subject,
      parent: { type: 'post', id: place.postId },
      display: { postTitle: place.post.title, ...display },
    };
  }
  return {
    type,
    scope: 'org',
    actorOrgUserId,
    communityId: null,
    spaceId: null,
    subject,
    parent: { type: 'activity', id: place.activityId },
    display: {
      activityTitle: place.activity.title,
      courseTitle: place.activity.courseTitle,
      courseId: place.activity.courseId,
      ...display,
    },
  };
}

async function mentionsOf(
  reads: NotificationReads,
  orgId: string,
  base: Omit<ListBase, 'type'>,
  mentioned: string[],
  reach: Reach,
): Promise<RecipientList[]> {
  if (mentioned.length === 0) {
    return [];
  }
  const recipients = await recipientsOf(
    reads,
    orgId,
    new Reasons().add(mentioned, 'mentioned'),
    reach,
  );
  return listOf({ ...base, type: 'mention' }, recipients);
}

async function commentLists(
  event: DomainEvent,
  reads: NotificationReads,
  comment: {
    id: string;
    postId: string | null;
    activityId: string | null;
    parentId: string | null;
    orgUserId: string;
    body: string;
    mentionedOrgUserIds: string[];
  },
): Promise<RecipientList[]> {
  const orgId = event.orgId;
  const place = await placeOf(reads, orgId, comment);
  if (!place) {
    return [];
  }
  const at = eventAt(event);
  const exclude = [comment.orgUserId, actorOr(event, comment.orgUserId)];
  const reasons = new Reasons();
  if (place.kind === 'post') {
    reasons.add([place.post.orgUserId], 'post_author');
  }
  const parent = comment.parentId ? await reads.comment(orgId, comment.parentId) : null;
  reasons.add([parent?.orgUserId], 'comment_author');
  if (place.kind === 'post') {
    reasons.add(await reads.followerIds(orgId, place.postId), 'follower');
  }
  reasons.add(
    await reads.threadParticipants(
      orgId,
      place.kind === 'post'
        ? { type: 'post', id: place.postId }
        : { type: 'activity', id: place.activityId },
    ),
    'thread_participant',
  );
  const name = await reads.displayName(orgId, comment.orgUserId);
  const text = await textExcerpt(reads, orgId, comment.body, POST_EXCERPT);
  const created = listOf(
    commentBase('comment.created', place, comment.id, comment.orgUserId, {
      commenterName: name,
      excerpt: text,
    }),
    await recipientsOf(reads, orgId, reasons, placeReach(reads, orgId, place, exclude, at)),
  );
  const mentions = await mentionsOf(
    reads,
    orgId,
    commentBase('mention', place, comment.id, comment.orgUserId, {
      authorName: name,
      excerpt: text,
    }),
    comment.mentionedOrgUserIds,
    placeReach(reads, orgId, place, exclude, at),
  );
  return [...created, ...mentions];
}

const postPublished: RecipientRule = async (event, reads) => {
  const parsed = discussionEvents.postPublished.safeParse(event);
  if (!parsed.success || previousStatusOf(event) === 'removed') {
    return [];
  }
  const post = parsed.data.data;
  const orgId = event.orgId;
  const space = await reads.space(orgId, post.spaceId);
  if (!space) {
    return [];
  }
  const at = eventAt(event);
  const actor = actorOr(event, null);
  const exclude = [...new Set([post.orgUserId, ...(actor ? [actor] : [])])];
  const reach = postReach(reads, orgId, post, exclude, at);
  const base = {
    scope: 'space' as const,
    communityId: post.communityId,
    spaceId: post.spaceId,
    subject: { type: 'post' as const, id: post.id },
    parent: null,
  };
  const lists: RecipientList[] = [];
  if (previousStatusOf(event) === 'pending') {
    lists.push(
      ...listOf(
        {
          ...base,
          type: 'post.approved',
          actorOrgUserId: actor,
          display: { postTitle: post.title, spaceName: space.name },
        },
        await recipientsOf(reads, orgId, new Reasons().add([post.orgUserId], 'subject'), {
          ...reach,
          exclude: [actor],
        }),
      ),
    );
  }
  const authorName = await reads.displayName(orgId, post.orgUserId);
  const text = await textExcerpt(reads, orgId, post.body || post.title, POST_EXCERPT);
  lists.push(
    ...(await mentionsOf(
      reads,
      orgId,
      {
        ...base,
        actorOrgUserId: post.orgUserId,
        display: { authorName, excerpt: text, postTitle: post.title },
      },
      post.mentionedOrgUserIds,
      reach,
    )),
  );
  lists.push({
    ...base,
    type: 'post.published',
    actorOrgUserId: post.orgUserId,
    display: {
      spaceName: space.name,
      postTitle: post.title,
      authorName,
      excerpt: text,
    },
    audience: { reason: 'space_member', spaceId: post.spaceId, exclude },
  });
  return lists;
};

async function awaitingReview(
  event: DomainEvent,
  reads: NotificationReads,
  post: {
    id: string;
    communityId: string;
    spaceId: string;
    orgUserId: string;
    title: string;
    status: string;
  },
): Promise<RecipientList[]> {
  if (post.status !== 'pending' || previousStatusOf(event) === 'pending') {
    return [];
  }
  const orgId = event.orgId;
  const space = await reads.space(orgId, post.spaceId);
  if (!space) {
    return [];
  }
  const actor = actorOr(event, post.orgUserId);
  return listOf(
    {
      type: 'post.awaiting_review',
      scope: 'space',
      actorOrgUserId: post.orgUserId,
      communityId: post.communityId,
      spaceId: post.spaceId,
      subject: { type: 'post', id: post.id },
      parent: null,
      display: {
        spaceName: space.name,
        postTitle: post.title,
        authorName: await reads.displayName(orgId, post.orgUserId),
      },
    },
    await recipientsOf(
      reads,
      orgId,
      new Reasons().add(await communityModerators(reads, orgId, post.communityId), 'moderator'),
      {
        exclude: [actor, post.orgUserId],
        at: eventAt(event),
        canOpen: (orgUserIds) => reads.spaceOpenersAmong(orgId, post.spaceId, orgUserIds),
      },
    ),
  );
}

const postCreated: RecipientRule = async (event, reads) => {
  const parsed = discussionEvents.postCreated.safeParse(event);
  return parsed.success ? awaitingReview(event, reads, parsed.data.data) : [];
};

const postUpdated: RecipientRule = async (event, reads) => {
  const parsed = discussionEvents.postUpdated.safeParse(event);
  if (!parsed.success) {
    return [];
  }
  const post = parsed.data.data;
  const orgId = event.orgId;
  const lists = await awaitingReview(event, reads, post);
  if (post.mentionedOrgUserIds.length === 0) {
    return lists;
  }
  const actor = actorOr(event, post.orgUserId);
  lists.push(
    ...(await mentionsOf(
      reads,
      orgId,
      {
        scope: 'space',
        actorOrgUserId: post.orgUserId,
        communityId: post.communityId,
        spaceId: post.spaceId,
        subject: { type: 'post', id: post.id },
        parent: null,
        display: {
          authorName: await reads.displayName(orgId, post.orgUserId),
          excerpt: await textExcerpt(reads, orgId, post.body || post.title, POST_EXCERPT),
          postTitle: post.title,
        },
      },
      post.mentionedOrgUserIds,
      postReach(reads, orgId, post, [actor, post.orgUserId], eventAt(event)),
    )),
  );
  return lists;
};

const postRemoved: RecipientRule = async (event, reads) => {
  const parsed = discussionEvents.postRemoved.safeParse(event);
  if (!parsed.success) {
    return [];
  }
  const post = parsed.data.data;
  const remover = post.removedBy ?? actorOr(event, null);
  if (!remover || remover === post.orgUserId) {
    return [];
  }
  const orgId = event.orgId;
  const space = await reads.space(orgId, post.spaceId);
  if (!space) {
    return [];
  }
  return listOf(
    {
      type: 'post.removed',
      scope: 'space',
      actorOrgUserId: remover,
      communityId: post.communityId,
      spaceId: post.spaceId,
      subject: { type: 'post', id: post.id },
      parent: null,
      display: { postTitle: post.title, spaceName: space.name },
    },
    await recipientsOf(
      reads,
      orgId,
      new Reasons().add([post.orgUserId], 'subject'),
      postReach(reads, orgId, post, [remover], eventAt(event)),
    ),
  );
};

const postReacted: RecipientRule = async (event, reads) => {
  const parsed = discussionEvents.postReactionAdded.safeParse(event);
  if (!parsed.success) {
    return [];
  }
  const reaction = parsed.data.data;
  const orgId = event.orgId;
  const post = await reads.post(orgId, reaction.postId);
  if (!post) {
    return [];
  }
  return listOf(
    {
      type: 'post.reacted',
      scope: 'space',
      actorOrgUserId: reaction.orgUserId,
      communityId: post.communityId,
      spaceId: post.spaceId,
      subject: { type: 'post', id: reaction.postId },
      parent: null,
      display: {
        postTitle: post.title,
        reactorName: await reads.displayName(orgId, reaction.orgUserId),
        reaction: reaction.reaction,
      },
    },
    await recipientsOf(
      reads,
      orgId,
      new Reasons().add([post.orgUserId], 'post_author'),
      postReach(
        reads,
        orgId,
        { id: reaction.postId, spaceId: post.spaceId },
        [reaction.orgUserId, actorOr(event, null)],
        eventAt(event),
      ),
    ),
  );
};

const commentCreated: RecipientRule = async (event, reads) => {
  const parsed = discussionEvents.commentCreated.safeParse(event);
  if (!parsed.success || parsed.data.data.status !== 'published') {
    return [];
  }
  return commentLists(event, reads, parsed.data.data);
};

const commentPublished: RecipientRule = async (event, reads) => {
  const parsed = discussionEvents.commentPublished.safeParse(event);
  return parsed.success ? commentLists(event, reads, parsed.data.data) : [];
};

const commentUpdated: RecipientRule = async (event, reads) => {
  const parsed = discussionEvents.commentUpdated.safeParse(event);
  if (!parsed.success) {
    return [];
  }
  const comment = parsed.data.data;
  if (comment.status !== 'published' || comment.mentionedOrgUserIds.length === 0) {
    return [];
  }
  const orgId = event.orgId;
  const place = await placeOf(reads, orgId, comment);
  if (!place) {
    return [];
  }
  return mentionsOf(
    reads,
    orgId,
    commentBase('mention', place, comment.id, comment.orgUserId, {
      authorName: await reads.displayName(orgId, comment.orgUserId),
      excerpt: await textExcerpt(reads, orgId, comment.body, POST_EXCERPT),
    }),
    comment.mentionedOrgUserIds,
    placeReach(
      reads,
      orgId,
      place,
      [comment.orgUserId, actorOr(event, comment.orgUserId)],
      eventAt(event),
    ),
  );
};

const commentRemoved: RecipientRule = async (event, reads) => {
  const parsed = discussionEvents.commentRemoved.safeParse(event);
  if (!parsed.success) {
    return [];
  }
  const comment = parsed.data.data;
  const remover = comment.removedBy ?? actorOr(event, null);
  if (!remover || remover === comment.orgUserId) {
    return [];
  }
  const orgId = event.orgId;
  const place = await placeOf(reads, orgId, comment);
  if (!place) {
    return [];
  }
  return listOf(
    commentBase('comment.removed', place, comment.id, remover, {}),
    await recipientsOf(
      reads,
      orgId,
      new Reasons().add([comment.orgUserId], 'subject'),
      placeReach(reads, orgId, place, [remover], eventAt(event)),
    ),
  );
};

const commentReacted: RecipientRule = async (event, reads) => {
  const parsed = discussionEvents.commentReactionAdded.safeParse(event);
  if (!parsed.success) {
    return [];
  }
  const reaction = parsed.data.data;
  const orgId = event.orgId;
  const comment = await reads.comment(orgId, reaction.commentId);
  const place = comment ? await placeOf(reads, orgId, comment) : null;
  if (!comment || !place) {
    return [];
  }
  return listOf(
    commentBase('comment.reacted', place, reaction.commentId, reaction.orgUserId, {
      excerpt: await textExcerpt(reads, orgId, comment.body, POST_EXCERPT),
      reactorName: await reads.displayName(orgId, reaction.orgUserId),
      reaction: reaction.reaction,
    }),
    await recipientsOf(
      reads,
      orgId,
      new Reasons().add([comment.orgUserId], 'comment_author'),
      placeReach(reads, orgId, place, [reaction.orgUserId, actorOr(event, null)], eventAt(event)),
    ),
  );
};

const postReported: RecipientRule = async (event, reads) => {
  const parsed = discussionEvents.postReported.safeParse(event);
  if (!parsed.success) {
    return [];
  }
  const flag = parsed.data.data;
  const orgId = event.orgId;
  const post = await reads.post(orgId, flag.postId);
  const space = post ? await reads.space(orgId, post.spaceId) : null;
  if (!post || !space) {
    return [];
  }
  return listOf(
    {
      type: 'content.flagged',
      scope: 'space',
      actorOrgUserId: flag.orgUserId,
      communityId: flag.communityId,
      spaceId: post.spaceId,
      subject: { type: 'post', id: flag.postId },
      parent: null,
      display: {
        spaceName: space.name,
        excerpt: await textExcerpt(reads, orgId, post.body || post.title, POST_EXCERPT),
        reason: flag.reason,
      },
    },
    await recipientsOf(
      reads,
      orgId,
      new Reasons().add(await communityModerators(reads, orgId, flag.communityId), 'moderator'),
      {
        exclude: [actorOr(event, flag.orgUserId)],
        at: eventAt(event),
        canOpen: (orgUserIds) => reads.spaceOpenersAmong(orgId, post.spaceId, orgUserIds),
      },
    ),
  );
};

const commentReported: RecipientRule = async (event, reads) => {
  const parsed = discussionEvents.commentReported.safeParse(event);
  if (!parsed.success) {
    return [];
  }
  const flag = parsed.data.data;
  const orgId = event.orgId;
  const comment = await reads.comment(orgId, flag.commentId);
  const place = comment ? await placeOf(reads, orgId, comment) : null;
  if (!comment || !place) {
    return [];
  }
  const actor = actorOr(event, flag.orgUserId);
  const text = await textExcerpt(reads, orgId, comment.body, POST_EXCERPT);
  if (place.kind === 'post') {
    return listOf(
      {
        ...commentBase('content.flagged', place, flag.commentId, actor, {}),
        display: { spaceName: place.spaceName, excerpt: text, reason: flag.reason },
      },
      await recipientsOf(
        reads,
        orgId,
        new Reasons().add(
          await communityModerators(reads, orgId, place.post.communityId),
          'moderator',
        ),
        {
          exclude: [actor],
          at: eventAt(event),
          canOpen: (orgUserIds) => reads.spaceOpenersAmong(orgId, place.post.spaceId, orgUserIds),
        },
      ),
    );
  }
  return listOf(
    commentBase('content.flagged', place, flag.commentId, actor, {
      excerpt: text,
      reason: flag.reason,
    }),
    await recipientsOf(
      reads,
      orgId,
      new Reasons().add(
        await reads.holders(orgId, 'courses:moderate', place.activity.courseId),
        'moderator',
      ),
      { exclude: [actor], at: eventAt(event) },
    ),
  );
};

function chatPending(event: DomainEvent, status: string): boolean {
  const value = event.metadata?.[CHAT_STATUS];
  return (typeof value === 'string' ? value : status) === 'pending';
}

async function chatMentions(
  event: DomainEvent,
  reads: NotificationReads,
  message: { id: string; chatId: string; orgUserId: string; body: string },
  mentioned: string[],
): Promise<RecipientList[]> {
  const orgId = event.orgId;
  const chat = await reads.chat(orgId, message.chatId);
  if (!chat || chatPending(event, chat.status)) {
    return [];
  }
  return mentionsOf(
    reads,
    orgId,
    {
      scope: 'chat',
      actorOrgUserId: message.orgUserId,
      communityId: chat.communityId,
      spaceId: null,
      subject: { type: 'message', id: message.id },
      parent: { type: 'chat', id: message.chatId },
      display: {
        authorName: await reads.displayName(orgId, message.orgUserId),
        excerpt: await textExcerpt(reads, orgId, message.body, MESSAGE_EXCERPT),
        chatTitle: await chatTitle(reads, orgId, chat, message.orgUserId),
      },
    },
    mentioned,
    chatReach(reads, orgId, chat, message.chatId, message.orgUserId, eventAt(event)),
  );
}

export function messageSummary(count: number): string {
  return count === 1 ? '1 new message' : `${count} new messages`;
}

const messageSent: RecipientRule = async (event, reads) => {
  const parsed = discussionEvents.messageSent.safeParse(event);
  if (!parsed.success) {
    return [];
  }
  const message = parsed.data.data;
  const orgId = event.orgId;
  const chat = await reads.chat(orgId, message.chatId);
  if (!chat || chatPending(event, chat.status)) {
    return [];
  }
  const senderName = await reads.displayName(orgId, message.orgUserId);
  const sent = listOf(
    {
      type: 'message.sent',
      scope: 'chat',
      actorOrgUserId: message.orgUserId,
      communityId: chat.communityId,
      spaceId: null,
      subject: { type: 'message', id: message.id },
      parent: { type: 'chat', id: message.chatId },
      display: {
        senderName,
        chatTitle: await chatTitle(reads, orgId, chat, message.orgUserId),
        excerpt: await textExcerpt(reads, orgId, message.body, MESSAGE_EXCERPT),
        count: '1',
        summary: messageSummary(1),
      },
    },
    await recipientsOf(
      reads,
      orgId,
      new Reasons().add(
        chat.participants.map((participant) => participant.orgUserId),
        'participant',
      ),
      chatReach(reads, orgId, chat, message.chatId, message.orgUserId, eventAt(event)),
    ),
  );
  return [...sent, ...(await chatMentions(event, reads, message, message.mentionedOrgUserIds))];
};

const messageUpdated: RecipientRule = async (event, reads) => {
  const parsed = discussionEvents.messageUpdated.safeParse(event);
  if (!parsed.success || parsed.data.data.mentionedOrgUserIds.length === 0) {
    return [];
  }
  const message = parsed.data.data;
  return chatMentions(event, reads, message, message.mentionedOrgUserIds);
};

const messageReacted: RecipientRule = async (event, reads) => {
  const parsed = discussionEvents.messageReactionAdded.safeParse(event);
  if (!parsed.success) {
    return [];
  }
  const reaction = parsed.data.data;
  const orgId = event.orgId;
  const [message, chat] = await Promise.all([
    reads.message(orgId, reaction.messageId),
    reads.chat(orgId, reaction.chatId),
  ]);
  if (!message || !chat) {
    return [];
  }
  return listOf(
    {
      type: 'message.reacted',
      scope: 'chat',
      actorOrgUserId: reaction.orgUserId,
      communityId: chat.communityId,
      spaceId: null,
      subject: { type: 'message', id: reaction.messageId },
      parent: { type: 'chat', id: reaction.chatId },
      display: {
        excerpt: await textExcerpt(reads, orgId, message.body, MESSAGE_EXCERPT),
        reactorName: await reads.displayName(orgId, reaction.orgUserId),
        reaction: reaction.reaction,
      },
    },
    await recipientsOf(
      reads,
      orgId,
      new Reasons().add([message.orgUserId], 'message_author'),
      chatReach(reads, orgId, chat, reaction.chatId, reaction.orgUserId, eventAt(event)),
    ),
  );
};

const messageReported: RecipientRule = async (event, reads) => {
  const parsed = discussionEvents.messageReported.safeParse(event);
  if (!parsed.success) {
    return [];
  }
  const flag = parsed.data.data;
  const orgId = event.orgId;
  const message = await reads.message(orgId, flag.messageId);
  return listOf(
    {
      type: 'message.flagged',
      scope: 'chat',
      actorOrgUserId: flag.orgUserId,
      communityId: flag.communityId,
      spaceId: null,
      subject: { type: 'message', id: flag.messageId },
      parent: message ? { type: 'chat', id: message.chatId } : null,
      display: { reason: flag.reason },
    },
    await recipientsOf(
      reads,
      orgId,
      new Reasons().add(await communityModerators(reads, orgId, flag.communityId), 'moderator'),
      { exclude: [actorOr(event, flag.orgUserId)], at: eventAt(event) },
    ),
  );
};

const chatCreated: RecipientRule = async (event, reads) => {
  const parsed = discussionEvents.chatCreated.safeParse(event);
  if (!parsed.success) {
    return [];
  }
  const created = parsed.data.data;
  if (created.kind !== 'direct' || created.status !== 'pending' || !created.createdBy) {
    return [];
  }
  const orgId = event.orgId;
  const chat = await reads.chat(orgId, created.id);
  if (!chat) {
    return [];
  }
  const body = await reads.latestMessageBody(orgId, created.id);
  return listOf(
    {
      type: 'chat.request',
      scope: 'chat',
      actorOrgUserId: created.createdBy,
      communityId: created.communityId,
      spaceId: null,
      subject: { type: 'chat', id: created.id },
      parent: null,
      display: {
        senderName: await reads.displayName(orgId, created.createdBy),
        excerpt: await textExcerpt(reads, orgId, body ?? '', MESSAGE_EXCERPT),
      },
    },
    await recipientsOf(
      reads,
      orgId,
      new Reasons().add(created.participantIds, 'participant'),
      chatReach(reads, orgId, chat, created.id, created.createdBy, eventAt(event)),
    ),
  );
};

const chatParticipantAdded: RecipientRule = async (event, reads) => {
  const parsed = discussionEvents.chatParticipantAdded.safeParse(event);
  if (!parsed.success) {
    return [];
  }
  const added = parsed.data.data;
  const orgId = event.orgId;
  const chat = await reads.chat(orgId, added.chatId);
  if (!chat) {
    return [];
  }
  return listOf(
    {
      type: 'chat.added',
      scope: 'chat',
      actorOrgUserId: added.addedBy,
      communityId: added.communityId,
      spaceId: null,
      subject: { type: 'chat', id: added.chatId },
      parent: null,
      display: {
        adderName: await reads.displayName(orgId, added.addedBy),
        participantNames: await participantNames(reads, orgId, chat),
      },
    },
    await recipientsOf(
      reads,
      orgId,
      new Reasons().add([added.orgUserId], 'subject'),
      chatReach(reads, orgId, chat, added.chatId, added.addedBy, eventAt(event)),
    ),
  );
};

const digestDue: RecipientRule = async (event, reads) => {
  const parsed = discussionEvents.digestDue.safeParse(event);
  if (!parsed.success) {
    return [];
  }
  const { communityId, from, to } = parsed.data.data;
  const orgId = event.orgId;
  const posts = await reads.postsPublished(orgId, communityId, from, to);
  if (posts.length === 0) {
    return [];
  }
  const title = await reads.communityTitle(orgId, communityId);
  if (title === null) {
    return [];
  }
  const spaceIds = [...new Set(posts.map((post) => post.spaceId))];
  const openers = new Map<string, Set<string>>();
  for (const spaceId of spaceIds) {
    const open = await reads.spaceOpeners(orgId, spaceId);
    const muted = new Set(
      open.length > 0
        ? await reads.mutedAmong(orgId, { type: 'space', id: spaceId }, open, eventAt(event))
        : [],
    );
    openers.set(spaceId, new Set(open.filter((orgUserId) => !muted.has(orgUserId))));
  }
  const groups = new Map<string, { spaceIds: string[]; members: Reasons }>();
  for (const orgUserId of await reads.communityMembers(orgId, communityId)) {
    const open = spaceIds.filter((spaceId) => openers.get(spaceId)?.has(orgUserId));
    if (open.length === 0) {
      continue;
    }
    const key = open.join(' ');
    const group = groups.get(key) ?? { spaceIds: open, members: new Reasons() };
    group.members.add([orgUserId], 'community_member');
    groups.set(key, group);
  }
  const lists: RecipientList[] = [];
  for (const group of groups.values()) {
    const shown = posts.filter((post) => group.spaceIds.includes(post.spaceId));
    lists.push(
      ...listOf(
        {
          type: 'digest',
          scope: 'community',
          actorOrgUserId: null,
          communityId,
          spaceId: null,
          subject: { type: 'community', id: communityId },
          parent: null,
          display: {
            communityTitle: title,
            from: from.toISOString(),
            to: to.toISOString(),
            posts: shown.map((post) => ({
              postId: post.postId,
              title: post.title,
              authorName: post.authorName,
              spaceName: post.spaceName,
              commentCount: post.commentCount,
            })),
          },
        },
        await recipientsOf(reads, orgId, group.members, { exclude: [], at: eventAt(event) }),
      ),
    );
  }
  return lists;
};

export const DISCUSSION_RULES: Record<string, RecipientRule> = {
  'discussion.post.published': postPublished,
  'discussion.post.created': postCreated,
  'discussion.post.updated': postUpdated,
  'discussion.post.removed': postRemoved,
  'discussion.post.reaction.added': postReacted,
  'discussion.comment.created': commentCreated,
  'discussion.comment.published': commentPublished,
  'discussion.comment.updated': commentUpdated,
  'discussion.comment.removed': commentRemoved,
  'discussion.comment.reaction.added': commentReacted,
  'discussion.post.reported': postReported,
  'discussion.comment.reported': commentReported,
  'discussion.message.sent': messageSent,
  'discussion.message.updated': messageUpdated,
  'discussion.message.reaction.added': messageReacted,
  'discussion.message.reported': messageReported,
  'discussion.chat.created': chatCreated,
  'discussion.chat.participant.added': chatParticipantAdded,
  'discussion.digest.due': digestDue,
};
