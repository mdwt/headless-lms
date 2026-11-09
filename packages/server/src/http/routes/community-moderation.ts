import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Container } from '../../app/container.js';
import { resolveActor } from '../scope.js';
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
      summary: 'List the people who hold a community',
      description: `Requires \`access:read\`. Everyone with active access to the community, granted directly or through a bundle, paged and searched by name or email.`,
      params: CommunityIdParam,
      querystring: CommunityMembersQuery,
      response: { 200: CommunityMembersPage, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return container.reporting.admin.communityMembers(req.params.communityId, req.query, actor);
    },
  });

  r.route({
    method: 'GET',
    url: '/api/communities/:communityId/spaces/:spaceId/members',
    schema: {
      operationId: 'listCommunitySpaceMembers',
      tags,
      summary: 'List the members, requests and invitations of a space',
      description: `For a person who can open the space. Its members; a holder of \`communities:moderate\` on the community also sees its open requests to join and open invitations. People who open every space of the community through their role are not listed. 404 when you cannot open the space.`,
      params: CommunitySpaceParam,
      querystring: PageQuery,
      response: { 200: SpaceMembersPage, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return container.entitlements.listSpaceMembers(
        req.params.communityId,
        req.params.spaceId,
        req.query,
        actor,
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
      description: `Requires \`communities:moderate\`. Places a member of the community straight into the space, with no request or invitation. 409 when the space is open to all members, the person is already placed, or the space is full.`,
      params: CommunitySpaceParam,
      body: OrgUserBody,
      response: { 201: SpaceMember, ...refusals(403, 404, 409) },
    },
    handler: async (req, reply) => {
      const actor = await resolveActor(container, req);
      const member = await container.entitlements.addSpaceMember(
        req.params.communityId,
        req.params.spaceId,
        req.body.orgUserId,
        actor,
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
      summary: 'Invite a person into a space',
      description: `Requires \`communities:moderate\`. Invites a member of the community into a \`by_invite\` space; they join when they accept. 403 when the person opens every space or is not a member of the community; 409 when the space is not invite-only or the person is already placed.`,
      params: CommunitySpaceParam,
      body: OrgUserBody,
      response: { 201: SpaceMember, ...refusals(403, 404, 409) },
    },
    handler: async (req, reply) => {
      const actor = await resolveActor(container, req);
      const member = await container.entitlements.invite(
        req.params.communityId,
        req.params.spaceId,
        req.body.orgUserId,
        actor,
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
      summary: "Approve a person's request to join a space",
      description: `Requires \`communities:moderate\`. Makes the requester an active member. 404 when the person has no open request; 409 when the space is full or they are already a member.`,
      params: SpaceMemberParam,
      response: { 200: SpaceMember, ...refusals(403, 404, 409) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return container.entitlements.approve(
        req.params.communityId,
        req.params.spaceId,
        req.params.orgUserId,
        actor,
      );
    },
  });

  r.route({
    method: 'POST',
    url: '/api/communities/:communityId/spaces/:spaceId/members/:orgUserId/decline',
    schema: {
      operationId: 'declineCommunitySpaceRequest',
      tags,
      summary: "Decline a person's request to join a space",
      description: `Requires \`communities:moderate\`. Closes the open request. 404 when the person has no open request; 409 when they are already a member.`,
      params: SpaceMemberParam,
      response: { 200: SpaceMember, ...refusals(403, 404, 409) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return container.entitlements.decline(
        req.params.communityId,
        req.params.spaceId,
        req.params.orgUserId,
        actor,
      );
    },
  });

  r.route({
    method: 'POST',
    url: '/api/communities/:communityId/spaces/:spaceId/members/:orgUserId/removal',
    schema: {
      operationId: 'removeCommunitySpaceMember',
      tags,
      summary: 'Remove a person from a space',
      description: `Requires \`communities:moderate\`. Revokes the placement, whether it is a membership, a request or an invitation. 409 when the space is open to all members or the placement is already revoked.`,
      params: SpaceMemberParam,
      response: { 200: SpaceMember, ...refusals(403, 404, 409) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return container.entitlements.remove(
        req.params.communityId,
        req.params.spaceId,
        req.params.orgUserId,
        actor,
      );
    },
  });

  r.route({
    method: 'GET',
    url: '/api/communities/:communityId/spaces/:spaceId/queue',
    schema: {
      operationId: 'getCommunitySpaceQueue',
      tags,
      summary: 'The moderation queue of a space',
      description: `Requires \`communities:moderate\`. Posts awaiting review, and the open flags on posts and on comments in the space. Each list holds at most the 100 oldest entries: pending posts by creation, flags by when they were raised; working the queue brings in the next ones.`,
      params: CommunitySpaceParam,
      response: { 200: SpaceQueue, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return container.posts.moderationQueue(req.params.communityId, req.params.spaceId, actor);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/communities/:communityId/posts/:postId/approval',
    schema: {
      operationId: 'approveCommunityPost',
      tags,
      summary: 'Publish a post that is awaiting review',
      description: `Requires \`communities:moderate\`. 409 when the post is not awaiting review.`,
      params: CommunityPostParam,
      response: { 200: PostView, ...refusals(403, 404, 409) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return container.posts.approve(req.params.postId, req.params.communityId, actor);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/communities/:communityId/posts/:postId/removal',
    schema: {
      operationId: 'removeCommunityPost',
      tags,
      summary: 'Remove a post',
      description: `The author can remove their own post; anyone else needs \`communities:moderate\` on the community. Takes a published or pending post down; removing someone else's post resolves its open flags as \`removed\`. 409 when it is already removed or was never submitted.`,
      params: CommunityPostParam,
      response: { 200: PostView, ...refusals(403, 404, 409) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return container.posts.remove(req.params.postId, req.params.communityId, actor);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/communities/:communityId/posts/:postId/restoration',
    schema: {
      operationId: 'restoreCommunityPost',
      tags,
      summary: 'Restore a removed post',
      description: `Requires \`communities:moderate\`. 409 when the post is not removed.`,
      params: CommunityPostParam,
      response: { 200: PostView, ...refusals(403, 404, 409) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return container.posts.restore(req.params.postId, req.params.communityId, actor);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/communities/:communityId/posts/:postId/flags/resolution',
    schema: {
      operationId: 'resolveCommunityPostFlags',
      tags,
      summary: 'Dismiss the open flags on a post',
      description: `Requires \`communities:moderate\`. Closes every open flag on the post and leaves it up.`,
      params: CommunityPostParam,
      body: ResolvePostFlags,
      response: { 204: z.void(), ...refusals(403, 404) },
    },
    handler: async (req, reply) => {
      const actor = await resolveActor(container, req);
      await container.posts.resolveFlags(
        req.params.postId,
        req.body.resolution,
        req.params.communityId,
        actor,
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
      description: `The author can remove their own comment; anyone else needs \`communities:moderate\` on the community. Hides the comment; removing someone else's comment resolves its open flags as \`removed\`. Removing a removed comment returns it unchanged.`,
      params: CommunityCommentParam,
      response: { 200: CommentView, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return container.discussion.remove(
        req.params.commentId,
        { communityId: req.params.communityId },
        actor,
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
      description: `Requires one of \`courses:moderate\`, \`communities:moderate\`. Publishes the comment again. Restoring a comment that is not removed returns it unchanged.`,
      params: CommunityCommentParam,
      response: { 200: CommentView, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return container.discussion.restore(
        req.params.commentId,
        { communityId: req.params.communityId },
        actor,
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
      description: `Requires one of \`courses:moderate\`, \`communities:moderate\`. Closes every open flag on the comment and leaves it up.`,
      params: CommunityCommentParam,
      body: ResolveCommentFlags,
      response: { 204: z.void(), ...refusals(403, 404) },
    },
    handler: async (req, reply) => {
      const actor = await resolveActor(container, req);
      await container.discussion.resolveReports(
        req.params.commentId,
        { communityId: req.params.communityId },
        actor,
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
      description: `Requires \`communities:moderate\`. Closes every open flag on the message and leaves it up.`,
      params: CommunityMessageParam,
      body: ResolveMessageFlags,
      response: { 204: z.void(), ...refusals(403, 404) },
    },
    handler: async (req, reply) => {
      const actor = await resolveActor(container, req);
      await container.chats.resolveMessageFlags(
        req.params.messageId,
        req.body.resolution,
        req.params.communityId,
        actor,
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
      description: `Requires \`communities:moderate\`. Nobody can send or edit messages until it is unlocked; its open message flags are resolved as \`locked\`. Locking a locked chat returns it unchanged.`,
      params: CommunityChatParam,
      response: { 200: Chat, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return container.chats.lock(req.params.chatId, req.params.communityId, actor);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/communities/:communityId/chats/:chatId/unlock',
    schema: {
      operationId: 'unlockCommunityChat',
      tags,
      summary: 'Unlock a chat',
      description: `Requires \`communities:moderate\`. Lets participants send messages again. Unlocking an unlocked chat returns it unchanged.`,
      params: CommunityChatParam,
      response: { 200: Chat, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return container.chats.unlock(req.params.chatId, req.params.communityId, actor);
    },
  });
}
