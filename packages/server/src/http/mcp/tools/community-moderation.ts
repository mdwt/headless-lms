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
import { actor, defineTool, type Tool } from '../tool.js';

export const communityModerationTools: Tool[] = [
  defineTool({
    name: 'get_space_moderation_queue',
    title: 'Get space moderation queue',
    description:
      'The posts awaiting review in a space and the open flags on its posts and comments. Each list holds at most the 100 oldest; working the queue brings in the next ones.',
    scope: 'community_moderation:read',
    kind: 'read',
    idempotent: true,
    openWorld: false,
    input: CommunitySpaceParam,
    call: ({ communityId, spaceId }, { container, scope }) =>
      container.posts.moderationQueue(scope.orgId, actor(scope), communityId, spaceId),
  }),
  defineTool({
    name: 'get_message_moderation_queue',
    title: 'Get message moderation queue',
    description:
      "The messages in a community's chats with open flags, with the flags and the chat each is in. Holds at most the 100 oldest open flags.",
    scope: 'community_moderation:read',
    kind: 'read',
    idempotent: true,
    openWorld: false,
    input: CommunityIdParam,
    call: ({ communityId }, { container, scope }) =>
      container.chats.messageQueue(scope.orgId, actor(scope), communityId),
  }),
  defineTool({
    name: 'approve_post',
    title: 'Approve post',
    description: 'Publish a post that is awaiting review.',
    scope: 'community_moderation:write',
    kind: 'write',
    idempotent: true,
    openWorld: false,
    input: CommunityPostParam,
    call: ({ communityId, postId }, { container, scope }) =>
      container.posts.approve(scope.orgId, postId, actor(scope), communityId),
  }),
  defineTool({
    name: 'dismiss_post_flags',
    title: 'Dismiss post flags',
    description: 'Close every open flag on a post and leave it up.',
    scope: 'community_moderation:write',
    kind: 'write',
    idempotent: true,
    openWorld: false,
    input: ResolvePostFlags.extend(CommunityPostParam.shape),
    call: ({ communityId, postId, resolution }, { container, scope }) =>
      container.posts.resolveFlags(scope.orgId, postId, actor(scope), resolution, communityId),
  }),
  defineTool({
    name: 'remove_post',
    title: 'Remove post',
    description:
      'Take a published or pending post down and resolve its open flags as removed. restore_post brings it back.',
    scope: 'community_moderation:write',
    kind: 'destructive',
    idempotent: true,
    openWorld: false,
    input: CommunityPostParam,
    call: ({ communityId, postId }, { container, scope }) =>
      container.posts.remove(scope.orgId, postId, actor(scope), communityId),
  }),
  defineTool({
    name: 'restore_post',
    title: 'Restore post',
    description: 'Put a removed post back up.',
    scope: 'community_moderation:write',
    kind: 'write',
    idempotent: true,
    openWorld: false,
    input: CommunityPostParam,
    call: ({ communityId, postId }, { container, scope }) =>
      container.posts.restore(scope.orgId, postId, actor(scope), communityId),
  }),
  defineTool({
    name: 'dismiss_post_comment_flags',
    title: 'Dismiss post comment flags',
    description: 'Close every open flag on a comment on a post and leave it up.',
    scope: 'community_moderation:write',
    kind: 'write',
    idempotent: true,
    openWorld: false,
    input: CommunityCommentParam,
    call: ({ communityId, commentId }, { container, scope }) =>
      container.discussion.resolveReports(scope.orgId, commentId, actor(scope), communityId),
  }),
  defineTool({
    name: 'remove_post_comment',
    title: 'Remove post comment',
    description:
      'Hide a comment on a post and resolve its open flags as removed. restore_post_comment brings it back.',
    scope: 'community_moderation:write',
    kind: 'destructive',
    idempotent: true,
    openWorld: false,
    input: CommunityCommentParam,
    call: ({ communityId, commentId }, { container, scope }) =>
      container.discussion.remove(scope.orgId, commentId, actor(scope), communityId),
  }),
  defineTool({
    name: 'restore_post_comment',
    title: 'Restore post comment',
    description: 'Publish a removed comment on a post again.',
    scope: 'community_moderation:write',
    kind: 'write',
    idempotent: true,
    openWorld: false,
    input: CommunityCommentParam,
    call: ({ communityId, commentId }, { container, scope }) =>
      container.discussion.restore(scope.orgId, commentId, actor(scope), communityId),
  }),
  defineTool({
    name: 'dismiss_message_flags',
    title: 'Dismiss message flags',
    description: 'Close every open flag on a chat message and leave it up.',
    scope: 'community_moderation:write',
    kind: 'write',
    idempotent: true,
    openWorld: false,
    input: ResolveMessageFlags.extend(CommunityMessageParam.shape),
    call: ({ communityId, messageId, resolution }, { container, scope }) =>
      container.chats.resolveMessageFlags(
        scope.orgId,
        actor(scope),
        messageId,
        resolution,
        communityId,
      ),
  }),
  defineTool({
    name: 'lock_chat',
    title: 'Lock chat',
    description:
      'Stop everyone sending or editing messages in a chat until it is unlocked. Its open message flags are resolved as locked.',
    scope: 'community_moderation:write',
    kind: 'destructive',
    idempotent: true,
    openWorld: false,
    input: CommunityChatParam,
    call: ({ communityId, chatId }, { container, scope }) =>
      container.chats.lock(scope.orgId, actor(scope), chatId, communityId),
  }),
  defineTool({
    name: 'unlock_chat',
    title: 'Unlock chat',
    description: 'Let the participants of a locked chat send messages again.',
    scope: 'community_moderation:write',
    kind: 'write',
    idempotent: true,
    openWorld: false,
    input: CommunityChatParam,
    call: ({ communityId, chatId }, { container, scope }) =>
      container.chats.unlock(scope.orgId, actor(scope), chatId, communityId),
  }),
];
