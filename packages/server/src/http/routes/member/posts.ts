import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Container } from '../../../app/container.js';
import { actorOf } from './actor.js';
import {
  CommentView,
  CommunityParam,
  CommunitySpaceParam,
  CreatePost,
  FeedQuery,
  FlagReason,
  PageQuery,
  PostCommentsPage,
  PostComment,
  PostFeedPage,
  PostFlag,
  PostIdParam,
  PostView,
  Reactions,
  ResolvePostFlags,
  SchedulePost,
  SetPostReactions,
  SetReaction,
  SpaceQueue,
  UpdatePost,
  refusals,
} from '../../schemas/index.js';

export async function memberPostRoutes(app: FastifyInstance, container: Container): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const posts = container.posts;
  const tags = ['Posts'];

  r.route({
    method: 'GET',
    url: '/api/member/communities/:communityId/feed',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'getMemberFeed',
      tags,
      summary: 'Published posts across the spaces you can open',
      description:
        'For a member of the community. Pinned posts first, then newest first. 404 when you are not a member.',
      params: CommunityParam,
      querystring: PageQuery,
      response: { 200: PostFeedPage, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const actor = await actorOf(container, req.orgId, req.userId);
      return posts.memberFeed(req.orgId, actor, req.params.communityId, req.query);
    },
  });

  r.route({
    method: 'GET',
    url: '/api/member/communities/:communityId/own-posts',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'listOwnPosts',
      tags,
      summary: 'Your own posts in a community, newest first',
      description:
        'For a member of the community. Your posts in any status, drafts included, in the spaces you can open. 404 when you are not a member.',
      params: CommunityParam,
      querystring: PageQuery,
      response: { 200: PostFeedPage, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const actor = await actorOf(container, req.orgId, req.userId);
      return posts.listOwn(req.orgId, actor, req.params.communityId, req.query);
    },
  });

  r.route({
    method: 'GET',
    url: '/api/member/communities/:communityId/bookmarks',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'listBookmarkedPosts',
      tags,
      summary: 'The posts you bookmarked in a community, newest bookmark first',
      description:
        'For a member of the community. Only posts you can still read. 404 when you are not a member.',
      params: CommunityParam,
      querystring: PageQuery,
      response: { 200: PostFeedPage, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const actor = await actorOf(container, req.orgId, req.userId);
      return posts.listBookmarked(req.orgId, actor, req.params.communityId, req.query);
    },
  });

  r.route({
    method: 'GET',
    url: '/api/member/communities/:communityId/spaces/:spaceId/feed',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'getSpaceFeed',
      tags,
      summary: 'Published posts in a space',
      description:
        'For anyone who can open the space (403 otherwise). Filter by `topicId`; an unknown topic is a 404.',
      params: CommunitySpaceParam,
      querystring: FeedQuery,
      response: { 200: PostFeedPage, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const actor = await actorOf(container, req.orgId, req.userId);
      return posts.spaceFeed(
        req.orgId,
        actor,
        req.params.communityId,
        req.params.spaceId,
        req.query,
      );
    },
  });

  r.route({
    method: 'GET',
    url: '/api/member/communities/:communityId/spaces/:spaceId/queue',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'getSpaceQueue',
      tags,
      summary: 'The moderation queue of a space you moderate',
      description:
        'For a moderator who can open the space. Posts awaiting review, and the open flags on posts and on comments in the space. Each list holds at most the 100 oldest entries: pending posts by creation, flags by when they were raised; working the queue brings in the next ones.',
      params: CommunitySpaceParam,
      response: { 200: SpaceQueue, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const actor = await actorOf(container, req.orgId, req.userId);
      return posts.moderationQueue(req.orgId, actor, req.params.communityId, req.params.spaceId);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/member/communities/:communityId/spaces/:spaceId/posts',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'createPost',
      tags,
      summary: 'Create a post',
      description:
        'For anyone who can open the space. `mode` decides the status: `draft`, `scheduled`, or on `submit` `published`, or `pending` when the space requires review and you are not staff. 409 when the space has topics and none is given, or a schedule is missing or in the past.',
      params: CommunitySpaceParam,
      body: CreatePost,
      response: { 201: PostView, ...refusals(403, 404, 409) },
    },
    handler: async (req, reply) => {
      const actor = await actorOf(container, req.orgId, req.userId);
      const post = await posts.create(req.orgId, actor, {
        ...req.body,
        communityId: req.params.communityId,
        spaceId: req.params.spaceId,
      });
      req.log.info({ postId: post.id, status: post.status }, 'post created');
      return reply.code(201).send(post);
    },
  });

  r.route({
    method: 'GET',
    url: '/api/member/posts/:postId',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'getPost',
      tags,
      summary: 'Read a post',
      description:
        'For anyone who can open the space while the post is published; for its author in any status; for moderators also while it is pending or removed. Any other post is a 404.',
      params: PostIdParam,
      response: { 200: PostView, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const actor = await actorOf(container, req.orgId, req.userId);
      return posts.getPost(req.orgId, actor, req.params.postId);
    },
  });

  r.route({
    method: 'PATCH',
    url: '/api/member/posts/:postId',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'updatePost',
      tags,
      summary: 'Edit your own post',
      description:
        'Author only. Changes only the fields sent. 409 when the post is removed, or the topic rules of the space are not met.',
      params: PostIdParam,
      body: UpdatePost,
      response: { 200: PostView, ...refusals(403, 404, 409) },
    },
    handler: async (req) => {
      const actor = await actorOf(container, req.orgId, req.userId);
      return posts.update(req.orgId, req.params.postId, actor, req.body);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/member/posts/:postId/submission',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'submitPost',
      tags,
      summary: 'Submit your draft or scheduled post',
      description:
        'Author only. Publishes it now, or holds it for review when the space requires review and you are not staff. 409 when the post is not a draft or scheduled.',
      params: PostIdParam,
      response: { 200: PostView, ...refusals(403, 404, 409) },
    },
    handler: async (req) => {
      const actor = await actorOf(container, req.orgId, req.userId);
      return posts.submit(req.orgId, req.params.postId, actor);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/member/posts/:postId/schedule',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'schedulePost',
      tags,
      summary: 'Schedule your post',
      description:
        'Author only. The post is submitted at `scheduledAt`. 409 when it is already submitted or removed, or the time is not in the future.',
      params: PostIdParam,
      body: SchedulePost,
      response: { 200: PostView, ...refusals(403, 404, 409) },
    },
    handler: async (req) => {
      const actor = await actorOf(container, req.orgId, req.userId);
      return posts.schedule(req.orgId, req.params.postId, actor, req.body.scheduledAt);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/member/posts/:postId/approval',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'approvePost',
      tags,
      summary: 'Publish a post that awaits review in a space you moderate',
      description:
        'For a moderator who can open the space. 409 when the post is not awaiting review.',
      params: PostIdParam,
      response: { 200: PostView, ...refusals(403, 404, 409) },
    },
    handler: async (req) => {
      const actor = await actorOf(container, req.orgId, req.userId);
      return posts.approve(req.orgId, req.params.postId, actor);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/member/posts/:postId/removal',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'removePost',
      tags,
      summary: 'Remove your post, or one in a space you moderate',
      description:
        "For the author or a moderator. Takes a published or pending post down; a moderator removing someone else's post resolves its open flags as `removed`. 409 when it is already removed or was never submitted.",
      params: PostIdParam,
      response: { 200: PostView, ...refusals(403, 404, 409) },
    },
    handler: async (req) => {
      const actor = await actorOf(container, req.orgId, req.userId);
      return posts.remove(req.orgId, req.params.postId, actor);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/member/posts/:postId/restoration',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'restorePost',
      tags,
      summary: 'Restore a removed post in a space you moderate',
      description: 'For a moderator who can open the space. 409 when the post is not removed.',
      params: PostIdParam,
      response: { 200: PostView, ...refusals(403, 404, 409) },
    },
    handler: async (req) => {
      const actor = await actorOf(container, req.orgId, req.userId);
      return posts.restore(req.orgId, req.params.postId, actor);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/member/posts/:postId/pin',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'pinPost',
      tags,
      summary: 'Pin a post in a space you moderate',
      description: 'For a moderator. Pinned posts lead the feeds. 409 when the post is removed.',
      params: PostIdParam,
      response: { 200: PostView, ...refusals(403, 404, 409) },
    },
    handler: async (req) => {
      const actor = await actorOf(container, req.orgId, req.userId);
      return posts.pin(req.orgId, req.params.postId, actor);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/member/posts/:postId/unpin',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'unpinPost',
      tags,
      summary: 'Unpin a post in a space you moderate',
      description: 'For a moderator. 409 when the post is removed.',
      params: PostIdParam,
      response: { 200: PostView, ...refusals(403, 404, 409) },
    },
    handler: async (req) => {
      const actor = await actorOf(container, req.orgId, req.userId);
      return posts.unpin(req.orgId, req.params.postId, actor);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/member/posts/:postId/comments/close',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'closePostComments',
      tags,
      summary: 'Close comments on a post in a space you moderate',
      description:
        'For a moderator. Nobody can comment until they are opened again. 409 when the post is removed.',
      params: PostIdParam,
      response: { 200: PostView, ...refusals(403, 404, 409) },
    },
    handler: async (req) => {
      const actor = await actorOf(container, req.orgId, req.userId);
      return posts.closeComments(req.orgId, req.params.postId, actor);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/member/posts/:postId/comments/open',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'openPostComments',
      tags,
      summary: 'Open comments on a post in a space you moderate',
      description: 'For a moderator. 409 when the post is removed.',
      params: PostIdParam,
      response: { 200: PostView, ...refusals(403, 404, 409) },
    },
    handler: async (req) => {
      const actor = await actorOf(container, req.orgId, req.userId);
      return posts.openComments(req.orgId, req.params.postId, actor);
    },
  });

  r.route({
    method: 'PUT',
    url: '/api/member/posts/:postId/reactions',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'setPostReactionPolicy',
      tags,
      summary: 'Turn reactions on or off for a post in a space you moderate',
      description:
        "For a moderator. Overrides the space's reactions setting for this post. 409 when the post is removed.",
      params: PostIdParam,
      body: SetPostReactions,
      response: { 200: PostView, ...refusals(403, 404, 409) },
    },
    handler: async (req) => {
      const actor = await actorOf(container, req.orgId, req.userId);
      return posts.setReactions(req.orgId, req.params.postId, actor, req.body.enabled);
    },
  });

  r.route({
    method: 'PUT',
    url: '/api/member/posts/:postId/reaction',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'setPostReaction',
      tags,
      summary: 'Set your reaction on a post',
      description:
        'For anyone who can read the post, while reactions are on for it (403 otherwise). Replaces any reaction you already had and returns the new counts.',
      params: PostIdParam,
      body: SetReaction,
      response: { 200: Reactions, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const actor = await actorOf(container, req.orgId, req.userId);
      return posts.setReaction(req.orgId, req.params.postId, actor, req.body.emoji);
    },
  });

  r.route({
    method: 'DELETE',
    url: '/api/member/posts/:postId/reaction',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'clearPostReaction',
      tags,
      summary: 'Withdraw your reaction from a post',
      description:
        'For anyone who can read the post, while reactions are on for it (403 otherwise). Returns the new counts.',
      params: PostIdParam,
      response: { 200: Reactions, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const actor = await actorOf(container, req.orgId, req.userId);
      return posts.setReaction(req.orgId, req.params.postId, actor, null);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/member/posts/:postId/follow',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'followPost',
      tags,
      summary: 'Follow a post',
      description:
        'For anyone who can read the post. You are notified of new comments on it. Following twice is harmless.',
      params: PostIdParam,
      response: { 204: z.void(), ...refusals(403, 404) },
    },
    handler: async (req, reply) => {
      const actor = await actorOf(container, req.orgId, req.userId);
      await posts.follow(req.orgId, req.params.postId, actor);
      return reply.code(204).send();
    },
  });

  r.route({
    method: 'DELETE',
    url: '/api/member/posts/:postId/follow',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'unfollowPost',
      tags,
      summary: 'Stop following a post',
      description: 'For anyone who can read the post. Harmless when you do not follow it.',
      params: PostIdParam,
      response: { 204: z.void(), ...refusals(403, 404) },
    },
    handler: async (req, reply) => {
      const actor = await actorOf(container, req.orgId, req.userId);
      await posts.unfollow(req.orgId, req.params.postId, actor);
      return reply.code(204).send();
    },
  });

  r.route({
    method: 'POST',
    url: '/api/member/posts/:postId/bookmark',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'bookmarkPost',
      tags,
      summary: 'Bookmark a post',
      description: 'For anyone who can read the post. Bookmarking twice is harmless.',
      params: PostIdParam,
      response: { 204: z.void(), ...refusals(403, 404) },
    },
    handler: async (req, reply) => {
      const actor = await actorOf(container, req.orgId, req.userId);
      await posts.bookmark(req.orgId, req.params.postId, actor);
      return reply.code(204).send();
    },
  });

  r.route({
    method: 'DELETE',
    url: '/api/member/posts/:postId/bookmark',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'unbookmarkPost',
      tags,
      summary: 'Remove a bookmark',
      description: 'For anyone who can read the post. Harmless when you have not bookmarked it.',
      params: PostIdParam,
      response: { 204: z.void(), ...refusals(403, 404) },
    },
    handler: async (req, reply) => {
      const actor = await actorOf(container, req.orgId, req.userId);
      await posts.unbookmark(req.orgId, req.params.postId, actor);
      return reply.code(204).send();
    },
  });

  r.route({
    method: 'POST',
    url: '/api/member/posts/:postId/flags',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'flagPost',
      tags,
      summary: 'Flag a post for the moderators',
      description:
        'For anyone who can read the post. Flagging it again while your flag is open returns that flag.',
      params: PostIdParam,
      body: FlagReason,
      response: { 201: PostFlag, ...refusals(403, 404) },
    },
    handler: async (req, reply) => {
      const actor = await actorOf(container, req.orgId, req.userId);
      const flag = await posts.flag(req.orgId, req.params.postId, actor, req.body.reason);
      return reply.code(201).send(flag);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/member/posts/:postId/flags/resolution',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'resolvePostFlags',
      tags,
      summary: 'Dismiss the open flags on a post in a space you moderate',
      description:
        'For a moderator who can open the space. Closes every open flag and leaves the post up.',
      params: PostIdParam,
      body: ResolvePostFlags,
      response: { 204: z.void(), ...refusals(403, 404) },
    },
    handler: async (req, reply) => {
      const actor = await actorOf(container, req.orgId, req.userId);
      await posts.resolveFlags(req.orgId, req.params.postId, actor, req.body.resolution);
      return reply.code(204).send();
    },
  });

  r.route({
    method: 'GET',
    url: '/api/member/posts/:postId/comments',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'listPostComments',
      tags,
      summary: "Read a post's comments",
      description:
        'For anyone who can read the post. Pages by top-level comment, oldest first. Each page carries its top-level comments and all of their replies; `total` counts top-level comments.',
      params: PostIdParam,
      querystring: PageQuery,
      response: { 200: PostCommentsPage, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const actor = await actorOf(container, req.orgId, req.userId);
      return container.discussion.postComments(req.orgId, req.params.postId, actor, req.query);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/member/posts/:postId/comments',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'createPostComment',
      tags,
      summary: 'Comment on a post',
      description:
        'For anyone who can read the post, while its comments are open (403 otherwise). Replies nest one level. 409 when the post is not published.',
      params: PostIdParam,
      body: PostComment,
      response: { 201: CommentView, ...refusals(403, 404, 409) },
    },
    handler: async (req, reply) => {
      const actor = await actorOf(container, req.orgId, req.userId);
      const comment = await container.discussion.postComment(req.orgId, {
        actor,
        postId: req.params.postId,
        parentId: req.body.parentId,
        body: req.body.body,
      });
      return reply.code(201).send(comment);
    },
  });
}
