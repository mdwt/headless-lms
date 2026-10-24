import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Container } from '../../../app/container.js';
import { UnauthorizedError } from '../../plugins/auth.js';
import {
  CommentView,
  CommunityParam,
  CommunitySpaceParam,
  CreatePost,
  ErrorBody,
  FeedQuery,
  FlagReason,
  MemberFeedQuery,
  PostComments,
  PostComment,
  PostFeedPage,
  PostFlag,
  PostIdParam,
  PostReactions,
  PostView,
  PostViews,
  ResolvePostFlags,
  SchedulePost,
  SetPostReactions,
  SetReaction,
  SpaceQueue,
  UpdatePost,
} from '../../schemas/index.js';

const errors = { 401: ErrorBody, 403: ErrorBody, 404: ErrorBody, 409: ErrorBody };

async function actorOf(container: Container, orgId: string, userId: string) {
  const orgUser = await container.organizations.getOrgUser(orgId, userId);
  if (!orgUser) {
    throw new UnauthorizedError();
  }
  return orgUser;
}

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
      summary: 'Published posts across the spaces a member can open',
      params: CommunityParam,
      querystring: MemberFeedQuery,
      response: { 200: PostFeedPage, 400: ErrorBody, ...errors },
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
      params: CommunityParam,
      response: { 200: PostViews, ...errors },
    },
    handler: async (req) => {
      const actor = await actorOf(container, req.orgId, req.userId);
      return posts.listOwn(req.orgId, actor, req.params.communityId);
    },
  });

  r.route({
    method: 'GET',
    url: '/api/member/communities/:communityId/bookmarks',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'listBookmarkedPosts',
      tags,
      summary: 'The posts you bookmarked in a community',
      params: CommunityParam,
      response: { 200: PostViews, ...errors },
    },
    handler: async (req) => {
      const actor = await actorOf(container, req.orgId, req.userId);
      return posts.listBookmarked(req.orgId, actor, req.params.communityId);
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
      params: CommunitySpaceParam,
      querystring: FeedQuery,
      response: { 200: PostFeedPage, 400: ErrorBody, ...errors },
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
      summary: 'Posts awaiting review and open flags',
      params: CommunitySpaceParam,
      response: { 200: SpaceQueue, ...errors },
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
      params: CommunitySpaceParam,
      body: CreatePost,
      response: { 201: PostView, ...errors },
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
      params: PostIdParam,
      response: { 200: PostView, ...errors },
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
      params: PostIdParam,
      body: UpdatePost,
      response: { 200: PostView, ...errors },
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
      summary: 'Submit a draft or scheduled post',
      params: PostIdParam,
      response: { 200: PostView, ...errors },
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
      summary: 'Schedule a post',
      params: PostIdParam,
      body: SchedulePost,
      response: { 200: PostView, ...errors },
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
      summary: 'Publish a post that is awaiting review',
      params: PostIdParam,
      response: { 200: PostView, ...errors },
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
      summary: 'Remove a post',
      params: PostIdParam,
      response: { 200: PostView, ...errors },
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
      summary: 'Restore a removed post',
      params: PostIdParam,
      response: { 200: PostView, ...errors },
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
      summary: 'Pin a post',
      params: PostIdParam,
      response: { 200: PostView, ...errors },
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
      summary: 'Unpin a post',
      params: PostIdParam,
      response: { 200: PostView, ...errors },
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
      summary: 'Close comments on a post',
      params: PostIdParam,
      response: { 200: PostView, ...errors },
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
      summary: 'Open comments on a post',
      params: PostIdParam,
      response: { 200: PostView, ...errors },
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
      summary: 'Turn reactions on or off for a post',
      params: PostIdParam,
      body: SetPostReactions,
      response: { 200: PostView, ...errors },
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
      params: PostIdParam,
      body: SetReaction,
      response: { 200: PostReactions, ...errors },
    },
    handler: async (req) => {
      const actor = await actorOf(container, req.orgId, req.userId);
      return posts.setReaction(req.orgId, req.params.postId, actor, req.body.emoji);
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
      params: PostIdParam,
      response: { 204: z.void(), ...errors },
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
      params: PostIdParam,
      response: { 204: z.void(), ...errors },
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
      params: PostIdParam,
      response: { 204: z.void(), ...errors },
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
      params: PostIdParam,
      response: { 204: z.void(), ...errors },
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
      summary: 'Flag a post',
      params: PostIdParam,
      body: FlagReason,
      response: { 201: PostFlag, ...errors },
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
      summary: 'Resolve the open flags on a post',
      params: PostIdParam,
      body: ResolvePostFlags,
      response: { 204: z.void(), ...errors },
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
      params: PostIdParam,
      response: { 200: PostComments, ...errors },
    },
    handler: async (req) => {
      const actor = await actorOf(container, req.orgId, req.userId);
      return container.discussion.postComments(req.orgId, req.params.postId, actor);
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
      params: PostIdParam,
      body: PostComment,
      response: { 200: CommentView, ...errors },
    },
    handler: async (req) => {
      const actor = await actorOf(container, req.orgId, req.userId);
      return container.discussion.postComment(req.orgId, {
        actor,
        postId: req.params.postId,
        parentId: req.body.parentId,
        body: req.body.body,
      });
    },
  });
}
