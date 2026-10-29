import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Container } from '../../app/container.js';
import { NotFoundError } from '@headless-lms/core/shared/errors';
import { resolveScope } from '../scope.js';
import {
  Chat,
  CommentView,
  CommunityChatParam,
  CommunityCommentParam,
  CommunityIdParam,
  CommunityMembersPage,
  CommunityMembersQuery,
  CommunityMessageParam,
  CommunityPostParam,
  CommunitySpaceParam,
  OrgUserBody,
  PageQuery,
  PostView,
  ResolveCommentFlags,
  ResolveMessageFlags,
  ResolvePostFlags,
  SpaceMember,
  SpaceMemberParam,
  SpaceMembersPage,
  SpaceQueue,
  refusals,
} from '../schemas/index.js';

export async function communityModerationRoutes(
  app: FastifyInstance,
  container: Container,
): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const tags = ['Communities'];

  r.route({
    method: 'GET',
    url: '/api/communities/:communityId/members',
    schema: {
      operationId: 'listCommunityMembers',
      tags,
      summary: 'List the people who hold a community (staff)',
      description:
        'Staff only (owner, admin, instructor). Everyone with active access to the community, granted directly or through a bundle, paged and searched by name or email.',
      params: CommunityIdParam,
      querystring: CommunityMembersQuery,
      response: { 200: CommunityMembersPage, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      const page = await container.reporting.admin.communityMembers(
        scope.orgId,
        req.params.communityId,
        req.query,
      );
      if (!page) {
        throw new NotFoundError('Community', req.params.communityId);
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
      summary: 'List the members, requests and invitations of a space (staff)',
      description:
        "Staff only (owner, admin, instructor). The space's members, its open requests to join and its open invitations.",
      params: CommunitySpaceParam,
      querystring: PageQuery,
      response: { 200: SpaceMembersPage, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return container.entitlements.listSpaceMembers(
        scope.orgId,
        { id: scope.orgUserId, role: scope.role },
        req.params.communityId,
        req.params.spaceId,
        req.query,
      );
    },
  });

  r.route({
    method: 'POST',
    url: '/api/communities/:communityId/spaces/:spaceId/members',
    schema: {
      operationId: 'addCommunitySpaceMember',
      tags,
      summary: 'Add a person to a space (staff)',
      description:
        'Staff only (owner, admin, instructor). Places a member of the community straight into the space, with no request or invitation. 409 when the space is open to all members, the person is already placed, or the space is full.',
      params: CommunitySpaceParam,
      body: OrgUserBody,
      response: { 201: SpaceMember, ...refusals(403, 404, 409) },
    },
    handler: async (req, reply) => {
      const scope = await resolveScope(container, req);
      const member = await container.entitlements.addSpaceMember(
        scope.orgId,
        { id: scope.orgUserId, role: scope.role },
        req.params.communityId,
        req.params.spaceId,
        req.body.orgUserId,
      );
      return reply.code(201).send(member);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/communities/:communityId/spaces/:spaceId/invites',
    schema: {
      operationId: 'inviteCommunitySpaceMember',
      tags,
      summary: 'Invite a person into a space (staff)',
      description:
        'Staff only (owner, admin, instructor). Invites a member of the community into a `by_invite` space; they join when they accept. 403 when the person is staff or does not hold the community; 409 when the space is not invite-only or the person is already placed.',
      params: CommunitySpaceParam,
      body: OrgUserBody,
      response: { 201: SpaceMember, ...refusals(403, 404, 409) },
    },
    handler: async (req, reply) => {
      const scope = await resolveScope(container, req);
      const member = await container.entitlements.invite(
        scope.orgId,
        { id: scope.orgUserId, role: scope.role },
        req.params.communityId,
        req.params.spaceId,
        req.body.orgUserId,
      );
      return reply.code(201).send(member);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/communities/:communityId/spaces/:spaceId/members/:orgUserId/approval',
    schema: {
      operationId: 'approveCommunitySpaceRequest',
      tags,
      summary: "Approve a person's request to join a space (staff)",
      description:
        'Staff only (owner, admin, instructor). Makes the requester an active member. 404 when the person has no open request; 409 when the space is full or they are already a member.',
      params: SpaceMemberParam,
      response: { 200: SpaceMember, ...refusals(403, 404, 409) },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return container.entitlements.approve(
        scope.orgId,
        { id: scope.orgUserId, role: scope.role },
        req.params.communityId,
        req.params.spaceId,
        req.params.orgUserId,
      );
    },
  });

  r.route({
    method: 'POST',
    url: '/api/communities/:communityId/spaces/:spaceId/members/:orgUserId/decline',
    schema: {
      operationId: 'declineCommunitySpaceRequest',
      tags,
      summary: "Decline a person's request to join a space (staff)",
      description:
        'Staff only (owner, admin, instructor). Closes the open request. 404 when the person has no open request; 409 when they are already a member.',
      params: SpaceMemberParam,
      response: { 200: SpaceMember, ...refusals(403, 404, 409) },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return container.entitlements.decline(
        scope.orgId,
        { id: scope.orgUserId, role: scope.role },
        req.params.communityId,
        req.params.spaceId,
        req.params.orgUserId,
      );
    },
  });

  r.route({
    method: 'POST',
    url: '/api/communities/:communityId/spaces/:spaceId/members/:orgUserId/removal',
    schema: {
      operationId: 'removeCommunitySpaceMember',
      tags,
      summary: 'Remove a person from a space (staff)',
      description:
        'Staff only (owner, admin, instructor). Revokes the placement, whether it is a membership, a request or an invitation. 409 when the space is open to all members or the placement is already revoked.',
      params: SpaceMemberParam,
      response: { 200: SpaceMember, ...refusals(403, 404, 409) },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return container.entitlements.remove(
        scope.orgId,
        { id: scope.orgUserId, role: scope.role },
        req.params.communityId,
        req.params.spaceId,
        req.params.orgUserId,
      );
    },
  });

  r.route({
    method: 'GET',
    url: '/api/communities/:communityId/spaces/:spaceId/queue',
    schema: {
      operationId: 'getCommunitySpaceQueue',
      tags,
      summary: 'The moderation queue of a space (staff)',
      description:
        'Staff only (owner, admin, instructor). Posts awaiting review, and the open flags on posts and on comments in the space. Each list holds at most the 100 oldest entries: pending posts by creation, flags by when they were raised; working the queue brings in the next ones.',
      params: CommunitySpaceParam,
      response: { 200: SpaceQueue, ...refusals(403, 404) },
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
      summary: 'Publish a post that is awaiting review (staff)',
      description:
        'Staff only (owner, admin, instructor). 409 when the post is not awaiting review.',
      params: CommunityPostParam,
      response: { 200: PostView, ...refusals(403, 404, 409) },
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
      summary: 'Remove a post (staff)',
      description:
        'Staff only (owner, admin, instructor). Takes a published or pending post down and resolves its open flags as `removed`. 409 when it is already removed or was never submitted.',
      params: CommunityPostParam,
      response: { 200: PostView, ...refusals(403, 404, 409) },
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
      summary: 'Restore a removed post (staff)',
      description: 'Staff only (owner, admin, instructor). 409 when the post is not removed.',
      params: CommunityPostParam,
      response: { 200: PostView, ...refusals(403, 404, 409) },
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
      summary: 'Dismiss the open flags on a post (staff)',
      description:
        'Staff only (owner, admin, instructor). Closes every open flag on the post and leaves it up.',
      params: CommunityPostParam,
      body: ResolvePostFlags,
      response: { 204: z.void(), ...refusals(403, 404) },
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
      summary: 'Remove a comment on a post (staff)',
      description:
        'Staff only (owner, admin, instructor). Hides the comment and resolves its open flags as `removed`. Removing a removed comment returns it unchanged.',
      params: CommunityCommentParam,
      response: { 200: CommentView, ...refusals(403, 404) },
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
      summary: 'Restore a removed comment on a post (staff)',
      description:
        'Staff only (owner, admin, instructor). Publishes the comment again. Restoring a comment that is not removed returns it unchanged.',
      params: CommunityCommentParam,
      response: { 200: CommentView, ...refusals(403, 404) },
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
      summary: 'Dismiss the open flags on a comment (staff)',
      description:
        'Staff only (owner, admin, instructor). Closes every open flag on the comment and leaves it up.',
      params: CommunityCommentParam,
      body: ResolveCommentFlags,
      response: { 204: z.void(), ...refusals(403, 404) },
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
      summary: 'Dismiss the open flags on a message (staff)',
      description:
        'Staff only (owner, admin, instructor). Closes every open flag on the message and leaves it up.',
      params: CommunityMessageParam,
      body: ResolveMessageFlags,
      response: { 204: z.void(), ...refusals(403, 404) },
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
      summary: 'Lock a chat (staff)',
      description:
        'Staff only (owner, admin, instructor). Nobody can send or edit messages until it is unlocked; its open message flags are resolved as `locked`. Locking a locked chat returns it unchanged.',
      params: CommunityChatParam,
      response: { 200: Chat, ...refusals(403, 404) },
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
      summary: 'Unlock a chat (staff)',
      description:
        'Staff only (owner, admin, instructor). Lets participants send messages again. Unlocking an unlocked chat returns it unchanged.',
      params: CommunityChatParam,
      response: { 200: Chat, ...refusals(403, 404) },
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
