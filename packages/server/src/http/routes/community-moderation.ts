import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Container } from '../../app/container.js';
import { NotFoundError } from '@headless-lms/core/shared/errors';
import { resolveScope } from '../scope.js';
import {
  Chat,
  Comment,
  CommunityChatParam,
  CommunityCommentParam,
  CommunityIdParam,
  CommunityMembersPage,
  CommunityMembersQuery,
  CommunityMessageParam,
  CommunityPostParam,
  CommunitySpaceParam,
  ErrorBody,
  OrgUserBody,
  PostView,
  ResolveMessageFlags,
  ResolvePostFlags,
  SpaceMember,
  SpaceMembers,
  SpaceQueue,
} from '../schemas/index.js';

const errors = { 401: ErrorBody, 403: ErrorBody, 404: ErrorBody, 409: ErrorBody };

export async function communityModerationRoutes(
  app: FastifyInstance,
  container: Container,
): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const tags = ['Communities'];

  r.route({
    method: 'GET',
    url: '/api/communities/:id/members',
    schema: {
      operationId: 'listCommunityMembers',
      tags,
      summary: 'List the people who hold a community, directly or through a bundle',
      params: CommunityIdParam,
      querystring: CommunityMembersQuery,
      response: { 200: CommunityMembersPage, ...errors },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      const page = await container.reporting.admin.communityMembers(
        scope.orgId,
        req.params.id,
        req.query,
      );
      if (!page) {
        throw new NotFoundError('Community', req.params.id);
      }
      return page;
    },
  });

  r.route({
    method: 'GET',
    url: '/api/communities/:communityId/spaces/:spaceId/members',
    schema: {
      operationId: 'listCommunitySpaceMembers',
      tags,
      summary: 'List the members, requests and invitations of a space',
      params: CommunitySpaceParam,
      response: { 200: SpaceMembers, ...errors },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return container.entitlements.listSpaceMembers(
        scope.orgId,
        { id: scope.orgUserId, role: scope.role },
        req.params.communityId,
        req.params.spaceId,
      );
    },
  });

  r.route({
    method: 'POST',
    url: '/api/communities/:communityId/spaces/:spaceId/members',
    schema: {
      operationId: 'addCommunitySpaceMember',
      tags,
      summary: 'Add a person to a space',
      params: CommunitySpaceParam,
      body: OrgUserBody,
      response: { 200: SpaceMember, ...errors },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return container.entitlements.addSpaceMember(
        scope.orgId,
        { id: scope.orgUserId, role: scope.role },
        req.params.communityId,
        req.params.spaceId,
        req.body.orgUserId,
      );
    },
  });

  r.route({
    method: 'POST',
    url: '/api/communities/:communityId/spaces/:spaceId/invites',
    schema: {
      operationId: 'inviteCommunitySpaceMember',
      tags,
      summary: 'Invite a person into a space',
      params: CommunitySpaceParam,
      body: OrgUserBody,
      response: { 200: SpaceMember, ...errors },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return container.entitlements.invite(
        scope.orgId,
        { id: scope.orgUserId, role: scope.role },
        req.params.communityId,
        req.params.spaceId,
        req.body.orgUserId,
      );
    },
  });

  r.route({
    method: 'POST',
    url: '/api/communities/:communityId/spaces/:spaceId/approvals',
    schema: {
      operationId: 'approveCommunitySpaceRequest',
      tags,
      summary: 'Approve a request to join a space',
      params: CommunitySpaceParam,
      body: OrgUserBody,
      response: { 200: SpaceMember, ...errors },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return container.entitlements.approve(
        scope.orgId,
        { id: scope.orgUserId, role: scope.role },
        req.params.communityId,
        req.params.spaceId,
        req.body.orgUserId,
      );
    },
  });

  r.route({
    method: 'POST',
    url: '/api/communities/:communityId/spaces/:spaceId/declines',
    schema: {
      operationId: 'declineCommunitySpaceRequest',
      tags,
      summary: 'Decline a request to join a space',
      params: CommunitySpaceParam,
      body: OrgUserBody,
      response: { 200: SpaceMember, ...errors },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return container.entitlements.decline(
        scope.orgId,
        { id: scope.orgUserId, role: scope.role },
        req.params.communityId,
        req.params.spaceId,
        req.body.orgUserId,
      );
    },
  });

  r.route({
    method: 'POST',
    url: '/api/communities/:communityId/spaces/:spaceId/removals',
    schema: {
      operationId: 'removeCommunitySpaceMember',
      tags,
      summary: 'Remove a person from a space',
      params: CommunitySpaceParam,
      body: OrgUserBody,
      response: { 200: SpaceMember, ...errors },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return container.entitlements.remove(
        scope.orgId,
        { id: scope.orgUserId, role: scope.role },
        req.params.communityId,
        req.params.spaceId,
        req.body.orgUserId,
      );
    },
  });

  r.route({
    method: 'GET',
    url: '/api/communities/:communityId/spaces/:spaceId/queue',
    schema: {
      operationId: 'getCommunitySpaceQueue',
      tags,
      summary: 'Posts awaiting review and open post and comment flags in a space',
      params: CommunitySpaceParam,
      response: { 200: SpaceQueue, ...errors },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return container.posts.moderationQueue(
        scope.orgId,
        { id: scope.orgUserId, role: scope.role },
        req.params.communityId,
        req.params.spaceId,
      );
    },
  });

  r.route({
    method: 'POST',
    url: '/api/communities/:communityId/posts/:postId/approval',
    schema: {
      operationId: 'approveCommunityPost',
      tags,
      summary: 'Publish a post that is awaiting review',
      params: CommunityPostParam,
      response: { 200: PostView, ...errors },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return container.posts.approve(
        scope.orgId,
        req.params.postId,
        { id: scope.orgUserId, role: scope.role },
        req.params.communityId,
      );
    },
  });

  r.route({
    method: 'POST',
    url: '/api/communities/:communityId/posts/:postId/removal',
    schema: {
      operationId: 'removeCommunityPost',
      tags,
      summary: 'Remove a post',
      params: CommunityPostParam,
      response: { 200: PostView, ...errors },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return container.posts.remove(
        scope.orgId,
        req.params.postId,
        { id: scope.orgUserId, role: scope.role },
        req.params.communityId,
      );
    },
  });

  r.route({
    method: 'POST',
    url: '/api/communities/:communityId/posts/:postId/restoration',
    schema: {
      operationId: 'restoreCommunityPost',
      tags,
      summary: 'Restore a removed post',
      params: CommunityPostParam,
      response: { 200: PostView, ...errors },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return container.posts.restore(
        scope.orgId,
        req.params.postId,
        { id: scope.orgUserId, role: scope.role },
        req.params.communityId,
      );
    },
  });

  r.route({
    method: 'POST',
    url: '/api/communities/:communityId/posts/:postId/flags/resolution',
    schema: {
      operationId: 'resolveCommunityPostFlags',
      tags,
      summary: 'Dismiss the open flags on a post',
      params: CommunityPostParam,
      body: ResolvePostFlags,
      response: { 204: z.void(), ...errors },
    },
    handler: async (req, reply) => {
      const scope = await resolveScope(container, req);
      await container.posts.resolveFlags(
        scope.orgId,
        req.params.postId,
        { id: scope.orgUserId, role: scope.role },
        req.body.resolution,
        req.params.communityId,
      );
      return reply.code(204).send();
    },
  });

  r.route({
    method: 'POST',
    url: '/api/communities/:communityId/comments/:commentId/removal',
    schema: {
      operationId: 'removeCommunityComment',
      tags,
      summary: 'Remove a comment on a post',
      params: CommunityCommentParam,
      response: { 200: Comment, ...errors },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return container.discussion.remove(
        scope.orgId,
        req.params.commentId,
        { id: scope.orgUserId, role: scope.role },
        req.params.communityId,
      );
    },
  });

  r.route({
    method: 'POST',
    url: '/api/communities/:communityId/comments/:commentId/restoration',
    schema: {
      operationId: 'restoreCommunityComment',
      tags,
      summary: 'Restore a removed comment on a post',
      params: CommunityCommentParam,
      response: { 200: Comment, ...errors },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return container.discussion.restore(
        scope.orgId,
        req.params.commentId,
        { id: scope.orgUserId, role: scope.role },
        req.params.communityId,
      );
    },
  });

  r.route({
    method: 'POST',
    url: '/api/communities/:communityId/comments/:commentId/flags/resolution',
    schema: {
      operationId: 'resolveCommunityCommentFlags',
      tags,
      summary: 'Dismiss the open flags on a comment',
      params: CommunityCommentParam,
      response: { 204: z.void(), ...errors },
    },
    handler: async (req, reply) => {
      const scope = await resolveScope(container, req);
      await container.discussion.resolveReports(
        scope.orgId,
        req.params.commentId,
        { id: scope.orgUserId, role: scope.role },
        req.params.communityId,
      );
      return reply.code(204).send();
    },
  });

  r.route({
    method: 'POST',
    url: '/api/communities/:communityId/messages/:messageId/flags/resolution',
    schema: {
      operationId: 'resolveCommunityMessageFlags',
      tags,
      summary: 'Dismiss the open flags on a message',
      params: CommunityMessageParam,
      body: ResolveMessageFlags,
      response: { 204: z.void(), ...errors },
    },
    handler: async (req, reply) => {
      const scope = await resolveScope(container, req);
      await container.chats.resolveMessageFlags(
        scope.orgId,
        { id: scope.orgUserId, role: scope.role },
        req.params.messageId,
        req.body.resolution,
        req.params.communityId,
      );
      return reply.code(204).send();
    },
  });

  r.route({
    method: 'POST',
    url: '/api/communities/:communityId/chats/:chatId/lock',
    schema: {
      operationId: 'lockCommunityChat',
      tags,
      summary: 'Lock a chat',
      params: CommunityChatParam,
      response: { 200: Chat, ...errors },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return container.chats.lock(
        scope.orgId,
        { id: scope.orgUserId, role: scope.role },
        req.params.chatId,
        req.params.communityId,
      );
    },
  });

  r.route({
    method: 'POST',
    url: '/api/communities/:communityId/chats/:chatId/unlock',
    schema: {
      operationId: 'unlockCommunityChat',
      tags,
      summary: 'Unlock a chat',
      params: CommunityChatParam,
      response: { 200: Chat, ...errors },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return container.chats.unlock(
        scope.orgId,
        { id: scope.orgUserId, role: scope.role },
        req.params.chatId,
        req.params.communityId,
      );
    },
  });
}
