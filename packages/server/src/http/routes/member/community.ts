import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { Container } from '../../../app/container.js';
import { NotFoundError } from '@headless-lms/core/shared/errors';
import { actorOf } from './actor.js';
import {
  CommunityHome,
  CommunityHomeSpace,
  CommunityParam,
  CommunitySpaceParam,
  DirectoryEntry,
  OrgUserBody,
  SpaceMember,
  SpaceMemberParam,
  SpaceMembers,
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
        'For a member of the community. Lists its spaces in order, each with where the viewer stands. 404 when the viewer is not a member.',
      params: CommunityParam,
      response: { 200: CommunityHome, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const actor = await actorOf(container, req.orgId, req.userId);
      const home = await container.reporting.member.communityHome(
        req.orgId,
        actor,
        req.params.communityId,
      );
      if (!home) {
        throw new NotFoundError('Community', req.params.communityId);
      }
      return home;
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
        'For a member of the community: the space with its topics, links, settings and where the viewer stands. 404 when the viewer is not a member or the space is not in the community.',
      params: CommunitySpaceParam,
      response: { 200: CommunityHomeSpace, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const actor = await actorOf(container, req.orgId, req.userId);
      const space = await container.reporting.member.communitySpace(
        req.orgId,
        actor,
        req.params.communityId,
        req.params.spaceId,
      );
      if (!space) {
        throw new NotFoundError('Space', req.params.spaceId);
      }
      return space;
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
        'For a member of the community: everyone who holds it, with their public profile. 404 when the viewer is not a member.',
      params: CommunityParam,
      response: { 200: DirectoryEntry.array(), ...refusals(403, 404) },
    },
    handler: async (req) => {
      const actor = await actorOf(container, req.orgId, req.userId);
      const rows = await container.reporting.member.directory(
        req.orgId,
        actor,
        req.params.communityId,
      );
      if (!rows) {
        throw new NotFoundError('Community', req.params.communityId);
      }
      return rows;
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
        'For anyone who can open the space. Members see the active members; moderators also see open requests and invitations.',
      params: CommunitySpaceParam,
      response: { 200: SpaceMembers, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const actor = await actorOf(container, req.orgId, req.userId);
      return container.entitlements.listSpaceMembers(
        req.orgId,
        actor,
        req.params.communityId,
        req.params.spaceId,
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
        'For a member of the community who is not staff. Opens a request on a `by_request` space for a moderator to approve. 409 when the space is not `by_request` or you are already placed in it.',
      params: CommunitySpaceParam,
      response: { 201: SpaceMember, ...refusals(403, 404, 409) },
    },
    handler: async (req, reply) => {
      const actor = await actorOf(container, req.orgId, req.userId);
      const member = await container.entitlements.requestJoin(
        req.orgId,
        actor,
        req.params.communityId,
        req.params.spaceId,
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
      description:
        'For a moderator who is a member of the community. Invites another member into a `by_invite` space; they join when they accept. 403 when the person is staff or does not hold the community; 409 when the space is not invite-only or the person is already placed.',
      params: CommunitySpaceParam,
      body: OrgUserBody,
      response: { 201: SpaceMember, ...refusals(403, 404, 409) },
    },
    handler: async (req, reply) => {
      const actor = await actorOf(container, req.orgId, req.userId);
      const member = await container.entitlements.invite(
        req.orgId,
        actor,
        req.params.communityId,
        req.params.spaceId,
        req.body.orgUserId,
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
      description:
        'For a moderator who is a member of the community. Places another member straight into the space, with no request or invitation. 409 when the space is open to all members, the person is already placed, or the space is full.',
      params: CommunitySpaceParam,
      body: OrgUserBody,
      response: { 201: SpaceMember, ...refusals(403, 404, 409) },
    },
    handler: async (req, reply) => {
      const actor = await actorOf(container, req.orgId, req.userId);
      const member = await container.entitlements.addSpaceMember(
        req.orgId,
        actor,
        req.params.communityId,
        req.params.spaceId,
        req.body.orgUserId,
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
        'For a member of the community who is not staff. Makes you an active member. 409 when you have no open invitation, are already a member, or the space is full.',
      params: CommunitySpaceParam,
      response: { 200: SpaceMember, ...refusals(403, 404, 409) },
    },
    handler: async (req) => {
      const actor = await actorOf(container, req.orgId, req.userId);
      return container.entitlements.accept(
        req.orgId,
        actor,
        req.params.communityId,
        req.params.spaceId,
      );
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
      description:
        'For a moderator who is a member of the community. Makes the requester an active member. 404 when the person has no open request; 409 when the space is full or they are already a member.',
      params: SpaceMemberParam,
      response: { 200: SpaceMember, ...refusals(403, 404, 409) },
    },
    handler: async (req) => {
      const actor = await actorOf(container, req.orgId, req.userId);
      return container.entitlements.approve(
        req.orgId,
        actor,
        req.params.communityId,
        req.params.spaceId,
        req.params.orgUserId,
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
      description:
        'For a moderator who is a member of the community. Closes the open request. 404 when the person has no open request; 409 when they are already a member.',
      params: SpaceMemberParam,
      response: { 200: SpaceMember, ...refusals(403, 404, 409) },
    },
    handler: async (req) => {
      const actor = await actorOf(container, req.orgId, req.userId);
      return container.entitlements.decline(
        req.orgId,
        actor,
        req.params.communityId,
        req.params.spaceId,
        req.params.orgUserId,
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
        'For a member of the community who is not staff. 409 when you have no open invitation or are already a member.',
      params: CommunitySpaceParam,
      response: { 200: SpaceMember, ...refusals(403, 404, 409) },
    },
    handler: async (req) => {
      const actor = await actorOf(container, req.orgId, req.userId);
      return container.entitlements.refuse(
        req.orgId,
        actor,
        req.params.communityId,
        req.params.spaceId,
      );
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
        'For a member of the community who is not staff. 409 when you are not a member of the space.',
      params: CommunitySpaceParam,
      response: { 200: SpaceMember, ...refusals(403, 404, 409) },
    },
    handler: async (req) => {
      const actor = await actorOf(container, req.orgId, req.userId);
      return container.entitlements.leave(
        req.orgId,
        actor,
        req.params.communityId,
        req.params.spaceId,
      );
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
      description:
        'For a moderator who is a member of the community. Revokes the placement, whether it is a membership, a request or an invitation. 409 when the space is open to all members or the placement is already revoked.',
      params: SpaceMemberParam,
      response: { 200: SpaceMember, ...refusals(403, 404, 409) },
    },
    handler: async (req) => {
      const actor = await actorOf(container, req.orgId, req.userId);
      return container.entitlements.remove(
        req.orgId,
        actor,
        req.params.communityId,
        req.params.spaceId,
        req.params.orgUserId,
      );
    },
  });
}
