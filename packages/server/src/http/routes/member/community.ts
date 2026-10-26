import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { Container } from '../../../app/container.js';
import { NotFoundError } from '@headless-lms/core/shared/errors';
import { UnauthorizedError } from '../../plugins/auth.js';
import {
  CommunityHome,
  CommunityHomeSpace,
  CommunityParam,
  CommunitySpaceParam,
  DirectoryEntry,
  ErrorBody,
  OrgUserBody,
  SpaceMember,
  SpaceMembers,
} from '../../schemas/index.js';

const errors = { 401: ErrorBody, 403: ErrorBody, 404: ErrorBody, 409: ErrorBody };

async function actorOf(container: Container, orgId: string, userId: string) {
  const orgUser = await container.organizations.getOrgUser(orgId, userId);
  if (!orgUser) {
    throw new UnauthorizedError();
  }
  return orgUser;
}

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
      params: CommunityParam,
      response: { 200: CommunityHome, ...errors },
    },
    handler: async (req) => {
      const actor = await actorOf(container, req.orgId, req.userId);
      const home = await container.reporting.member.communityHome(req.orgId, actor, req.params.communityId);
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
      summary: 'One space as a member sees it: its topics, links, settings and where the viewer stands',
      params: CommunitySpaceParam,
      response: { 200: CommunityHomeSpace, ...errors },
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
      params: CommunityParam,
      response: { 200: DirectoryEntry.array(), ...errors },
    },
    handler: async (req) => {
      const actor = await actorOf(container, req.orgId, req.userId);
      const rows = await container.reporting.member.directory(req.orgId, actor, req.params.communityId);
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
      summary: 'List space members',
      params: CommunitySpaceParam,
      response: { 200: SpaceMembers, ...errors },
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
      params: CommunitySpaceParam,
      response: { 200: SpaceMember, ...errors },
    },
    handler: async (req) => {
      const actor = await actorOf(container, req.orgId, req.userId);
      return container.entitlements.requestJoin(
        req.orgId,
        actor,
        req.params.communityId,
        req.params.spaceId,
      );
    },
  });

  r.route({
    method: 'POST',
    url: '/api/member/communities/:communityId/spaces/:spaceId/invites',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'inviteSpaceMember',
      tags,
      summary: 'Invite a person into a space',
      params: CommunitySpaceParam,
      body: OrgUserBody,
      response: { 200: SpaceMember, ...errors },
    },
    handler: async (req) => {
      const actor = await actorOf(container, req.orgId, req.userId);
      return container.entitlements.invite(
        req.orgId,
        actor,
        req.params.communityId,
        req.params.spaceId,
        req.body.orgUserId,
      );
    },
  });

  r.route({
    method: 'POST',
    url: '/api/member/communities/:communityId/spaces/:spaceId/members',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'addSpaceMember',
      tags,
      summary: 'Add a person to a space',
      params: CommunitySpaceParam,
      body: OrgUserBody,
      response: { 200: SpaceMember, ...errors },
    },
    handler: async (req) => {
      const actor = await actorOf(container, req.orgId, req.userId);
      return container.entitlements.addSpaceMember(
        req.orgId,
        actor,
        req.params.communityId,
        req.params.spaceId,
        req.body.orgUserId,
      );
    },
  });

  r.route({
    method: 'POST',
    url: '/api/member/communities/:communityId/spaces/:spaceId/acceptance',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'acceptSpaceInvite',
      tags,
      summary: 'Accept an invitation to a space',
      params: CommunitySpaceParam,
      response: { 200: SpaceMember, ...errors },
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
    url: '/api/member/communities/:communityId/spaces/:spaceId/approvals',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'approveSpaceRequest',
      tags,
      summary: 'Approve a request to join a space',
      params: CommunitySpaceParam,
      body: OrgUserBody,
      response: { 200: SpaceMember, ...errors },
    },
    handler: async (req) => {
      const actor = await actorOf(container, req.orgId, req.userId);
      return container.entitlements.approve(
        req.orgId,
        actor,
        req.params.communityId,
        req.params.spaceId,
        req.body.orgUserId,
      );
    },
  });

  r.route({
    method: 'POST',
    url: '/api/member/communities/:communityId/spaces/:spaceId/declines',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'declineSpaceRequest',
      tags,
      summary: 'Decline a request to join a space',
      params: CommunitySpaceParam,
      body: OrgUserBody,
      response: { 200: SpaceMember, ...errors },
    },
    handler: async (req) => {
      const actor = await actorOf(container, req.orgId, req.userId);
      return container.entitlements.decline(
        req.orgId,
        actor,
        req.params.communityId,
        req.params.spaceId,
        req.body.orgUserId,
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
      summary: 'Refuse an invitation to a space',
      params: CommunitySpaceParam,
      response: { 200: SpaceMember, ...errors },
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
      params: CommunitySpaceParam,
      response: { 200: SpaceMember, ...errors },
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
    url: '/api/member/communities/:communityId/spaces/:spaceId/removals',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'removeSpaceMember',
      tags,
      summary: 'Remove a person from a space',
      params: CommunitySpaceParam,
      body: OrgUserBody,
      response: { 200: SpaceMember, ...errors },
    },
    handler: async (req) => {
      const actor = await actorOf(container, req.orgId, req.userId);
      return container.entitlements.remove(
        req.orgId,
        actor,
        req.params.communityId,
        req.params.spaceId,
        req.body.orgUserId,
      );
    },
  });
}
