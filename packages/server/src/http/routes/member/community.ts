import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Container } from '../../../app/container.js';
import { resolveActor } from '../../scope.js';
import {
  CommunityHome,
  CommunityHomeSpace,
  CommunityParam,
  CommunitySpaceParam,
  DirectoryPage,
  DirectoryQuery,
  OrgUserBody,
  PageQuery,
  SetMute,
  SpaceIdParam,
  SpaceMember,
  SpaceMemberParam,
  SpaceMembersPage,
  refusals,
} from '../../schemas/index.js';

export async function memberCommunityRoutes(
  app: FastifyInstance,
  container: Container,
): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const tags = ['Communities'];

  r.route({
    method: 'GET',
    url: '/api/member/communities/:communityId/home',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'getMemberCommunityHome',
      tags,
      summary: 'The spaces a member can see in a community',
      description:
        "For a member of the community, through a grant or `communities:read` on it. Lists its spaces in order. Spaces the viewer can open come back in full; spaces they can see but not open come back locked, with only their name, count, rule and the viewer's standing. A by-invite space the viewer is not invited to or a member of is left out, unless the viewer opens every space. `viewer` carries the viewer's permissions on the community, whether they open every space, and their team flag and role name. 404 when the viewer is not a member.",
      params: CommunityParam,
      response: { 200: CommunityHome, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return container.reporting.member.communityHome(req.params.communityId, actor);
    },
  });

  r.route({
    method: 'GET',
    url: '/api/member/communities/:communityId/spaces/:spaceId',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'getMemberSpace',
      tags,
      summary: 'One space as a member sees it',
      description:
        'For a member of the community: the space with its topics, links, settings and where the viewer stands. A space the viewer cannot open comes back locked, without its content. 404 when the viewer is not a member, the space is not in the community, or it is a by-invite space the viewer is not invited to or a member of.',
      params: CommunitySpaceParam,
      response: { 200: CommunityHomeSpace, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return container.reporting.member.communitySpace(
        req.params.communityId,
        req.params.spaceId,
        actor,
      );
    },
  });

  r.route({
    method: 'GET',
    url: '/api/member/communities/:communityId/directory',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'getMemberCommunityDirectory',
      tags,
      summary: 'People in a community',
      description:
        'For a member of the community: everyone who holds it or holds `communities:read` on it, with their public profile, whether they are team here and under which role name, and whether they open every space. 404 when the viewer is not a member.',
      params: CommunityParam,
      querystring: DirectoryQuery,
      response: { 200: DirectoryPage, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return container.reporting.member.directory(req.params.communityId, req.query, actor);
    },
  });

  r.route({
    method: 'GET',
    url: '/api/member/communities/:communityId/spaces/:spaceId/members',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'listSpaceMembers',
      tags,
      summary: 'List the members of a space',
      description:
        'For anyone who can open the space. Members see the active members; holders of `communities:moderate` on the community also see open requests and invitations. Who opens every space holds no place, and is left out.',
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
    url: '/api/member/communities/:communityId/spaces/:spaceId/requests',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'requestSpaceMembership',
      tags,
      summary: 'Ask to join a space',
      description:
        'For a member of the community who does not open every space. Opens a request on a `by_request` space for a moderator to approve. 409 when the space is not `by_request` or you are already placed in it.',
      params: CommunitySpaceParam,
      response: { 201: SpaceMember, ...refusals(403, 404, 409) },
    },
    handler: async (req, reply) => {
      const actor = await resolveActor(container, req);
      const member = await container.entitlements.requestJoin(
        req.params.communityId,
        req.params.spaceId,
        actor,
      );
      return reply.code(201).send(member);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/member/communities/:communityId/spaces/:spaceId/invites',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'inviteSpaceMember',
      tags,
      summary: 'Invite a person into a space you moderate',
      description: `Requires \`communities:moderate\`. On the community, as its member. Invites another member into a \`by_invite\` space; they join when they accept. 403 when the person opens every space or is not a member of the community; 409 when the space is not invite-only or the person is already placed.`,
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
    url: '/api/member/communities/:communityId/spaces/:spaceId/members',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'addSpaceMember',
      tags,
      summary: 'Add a person to a space you moderate',
      description: `Requires \`communities:moderate\`. On the community, as its member. Places another member straight into the space, with no request or invitation. 403 when the person opens every space; 409 when the space is open to all members, the person is already placed, or the space is full.`,
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
    url: '/api/member/communities/:communityId/spaces/:spaceId/acceptance',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'acceptSpaceInvite',
      tags,
      summary: 'Accept your invitation to a space',
      description:
        'For a member of the community who does not open every space. Makes you an active member. 409 when you have no open invitation, are already a member, or the space is full.',
      params: CommunitySpaceParam,
      response: { 200: SpaceMember, ...refusals(403, 404, 409) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return container.entitlements.accept(req.params.communityId, req.params.spaceId, actor);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/member/communities/:communityId/spaces/:spaceId/members/:orgUserId/approval',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'approveSpaceRequest',
      tags,
      summary: "Approve a person's request to join a space you moderate",
      description: `Requires \`communities:moderate\`. On the community, as its member. Makes the requester an active member. 404 when the person has no open request; 409 when the space is full or they are already a member.`,
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
    url: '/api/member/communities/:communityId/spaces/:spaceId/members/:orgUserId/decline',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'declineSpaceRequest',
      tags,
      summary: "Decline a person's request to join a space you moderate",
      description: `Requires \`communities:moderate\`. On the community, as its member. Closes the open request. 404 when the person has no open request; 409 when they are already a member.`,
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
    url: '/api/member/communities/:communityId/spaces/:spaceId/refusal',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'refuseSpaceInvite',
      tags,
      summary: 'Refuse your invitation to a space',
      description:
        'For a member of the community who does not open every space. 409 when you have no open invitation or are already a member.',
      params: CommunitySpaceParam,
      response: { 200: SpaceMember, ...refusals(403, 404, 409) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return container.entitlements.refuse(req.params.communityId, req.params.spaceId, actor);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/member/communities/:communityId/spaces/:spaceId/departure',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'leaveSpace',
      tags,
      summary: 'Leave a space',
      description:
        'For a member of the community who does not open every space. 409 when you are not a member of the space.',
      params: CommunitySpaceParam,
      response: { 200: SpaceMember, ...refusals(403, 404, 409) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return container.entitlements.leave(req.params.communityId, req.params.spaceId, actor);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/member/communities/:communityId/spaces/:spaceId/members/:orgUserId/removal',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'removeSpaceMember',
      tags,
      summary: 'Remove a person from a space you moderate',
      description: `Requires \`communities:moderate\`. On the community, as its member. Revokes the placement, whether it is a membership, a request or an invitation. 409 when the space is open to all members or the placement is already revoked.`,
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
    method: 'PUT',
    url: '/api/member/spaces/:spaceId/subscription',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'setSpaceSubscription',
      tags,
      summary: 'Mute a space, or clear your mute',
      description:
        'For anyone who can open the space. `muted` stops its activity notifying you, until `mutedUntil` when given; mentions, actions on you and moderation work still notify. `none` clears the mute.',
      params: SpaceIdParam,
      body: SetMute,
      response: { 204: z.void(), ...refusals(403, 404) },
    },
    handler: async (req, reply) => {
      const actor = await resolveActor(container, req);
      await container.subscriptions.setSpace(req.params.spaceId, req.body, actor);
      return reply.code(204).send();
    },
  });
}
