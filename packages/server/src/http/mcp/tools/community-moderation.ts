import {
  CommunityChatParam,
  CommunityCommentParam,
  CommunityIdParam,
  CommunityMessageParam,
  CommunityPostParam,
  CommunitySpaceParam,
  ResolveMessageFlags,
  ResolvePostFlags,
} from '../../schemas/index.js';
import { defineTool, type Tool } from '../tool.js';

export const communityModerationTools: Tool[] = [
  defineTool({
    name: 'get_space_moderation_queue',
    title: 'Get space moderation queue',
    description:
      'The posts awaiting review in a space and the open flags on its posts and comments. Each list holds at most the 100 oldest; working the queue brings in the next ones.',
    operation: 'posts.moderationQueue',
    kind: 'read',
    idempotent: true,
    openWorld: false,
    input: CommunitySpaceParam,
    call: ({ communityId, spaceId }, { container, caller }) =>
      container.posts.moderationQueue(communityId, spaceId, caller.actor),
  }),
  defineTool({
    name: 'get_message_moderation_queue',
    title: 'Get message moderation queue',
    description:
      "The messages in a community's chats with open flags, with the flags and the chat each is in. Holds at most the 100 oldest open flags.",
    operation: 'chats.messageQueue',
    kind: 'read',
    idempotent: true,
    openWorld: false,
    input: CommunityIdParam,
    call: ({ communityId }, { container, caller }) =>
      container.chats.messageQueue(communityId, caller.actor),
  }),
  defineTool({
    name: 'approve_post',
    title: 'Approve post',
    description: 'Publish a post that is awaiting review.',
    operation: 'posts.approve',
    kind: 'write',
    idempotent: true,
    openWorld: false,
    input: CommunityPostParam,
    call: ({ communityId, postId }, { container, caller }) =>
      container.posts.approve(postId, communityId, caller.actor),
  }),
  defineTool({
    name: 'dismiss_post_flags',
    title: 'Dismiss post flags',
    description: 'Close every open flag on a post and leave it up.',
    operation: 'posts.resolveFlags',
    kind: 'write',
    idempotent: true,
    openWorld: false,
    input: ResolvePostFlags.extend(CommunityPostParam.shape),
    call: ({ communityId, postId, resolution }, { container, caller }) =>
      container.posts.resolveFlags(postId, resolution, communityId, caller.actor),
  }),
  defineTool({
    name: 'remove_post',
    title: 'Remove post',
    description:
      'Take a published or pending post down and resolve its open flags as removed. restore_post brings it back.',
    operation: 'posts.remove',
    kind: 'destructive',
    idempotent: true,
    openWorld: false,
    input: CommunityPostParam,
    call: ({ communityId, postId }, { container, caller }) =>
      container.posts.remove(postId, communityId, caller.actor),
  }),
  defineTool({
    name: 'restore_post',
    title: 'Restore post',
    description: 'Put a removed post back up.',
    operation: 'posts.restore',
    kind: 'write',
    idempotent: true,
    openWorld: false,
    input: CommunityPostParam,
    call: ({ communityId, postId }, { container, caller }) =>
      container.posts.restore(postId, communityId, caller.actor),
  }),
  defineTool({
    name: 'dismiss_post_comment_flags',
    title: 'Dismiss post comment flags',
    description: 'Close every open flag on a comment on a post and leave it up.',
    operation: 'discussion.resolveReports',
    kind: 'write',
    idempotent: true,
    openWorld: false,
    input: CommunityCommentParam,
    call: ({ communityId, commentId }, { container, caller }) =>
      container.discussion.resolveReports(commentId, { communityId }, caller.actor),
  }),
  defineTool({
    name: 'remove_post_comment',
    title: 'Remove post comment',
    description:
      'Hide a comment on a post and resolve its open flags as removed. restore_post_comment brings it back.',
    operation: 'discussion.remove',
    kind: 'destructive',
    idempotent: true,
    openWorld: false,
    input: CommunityCommentParam,
    call: ({ communityId, commentId }, { container, caller }) =>
      container.discussion.remove(commentId, { communityId }, caller.actor),
  }),
  defineTool({
    name: 'restore_post_comment',
    title: 'Restore post comment',
    description: 'Publish a removed comment on a post again.',
    operation: 'discussion.restore',
    kind: 'write',
    idempotent: true,
    openWorld: false,
    input: CommunityCommentParam,
    call: ({ communityId, commentId }, { container, caller }) =>
      container.discussion.restore(commentId, { communityId }, caller.actor),
  }),
  defineTool({
    name: 'dismiss_message_flags',
    title: 'Dismiss message flags',
    description: 'Close every open flag on a chat message and leave it up.',
    operation: 'chats.resolveMessageFlags',
    kind: 'write',
    idempotent: true,
    openWorld: false,
    input: ResolveMessageFlags.extend(CommunityMessageParam.shape),
    call: ({ communityId, messageId, resolution }, { container, caller }) =>
      container.chats.resolveMessageFlags(messageId, resolution, communityId, caller.actor),
  }),
  defineTool({
    name: 'lock_chat',
    title: 'Lock chat',
    description:
      'Stop everyone sending or editing messages in a chat until it is unlocked. Its open message flags are resolved as locked.',
    operation: 'chats.lock',
    kind: 'destructive',
    idempotent: true,
    openWorld: false,
    input: CommunityChatParam,
    call: ({ communityId, chatId }, { container, caller }) =>
      container.chats.lock(chatId, communityId, caller.actor),
  }),
  defineTool({
    name: 'unlock_chat',
    title: 'Unlock chat',
    description: 'Let the participants of a locked chat send messages again.',
    operation: 'chats.unlock',
    kind: 'write',
    idempotent: true,
    openWorld: false,
    input: CommunityChatParam,
    call: ({ communityId, chatId }, { container, caller }) =>
      container.chats.unlock(chatId, communityId, caller.actor),
  }),
];
