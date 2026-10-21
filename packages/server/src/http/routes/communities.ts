import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Container } from '../../app/container.js';
import { NotFoundError } from '@headless-lms/core/shared/errors';
import { resolveScope } from '../scope.js';
import {
  Community,
  CommunityAnalytics,
  CommunityIdParam,
  CommunitySpaceParam,
  CommunitiesPage,
  CommunitiesQuery,
  CreateCommunity,
  CreateSpace,
  ErrorBody,
  MessageQueue,
  OrderedIds,
  PatchDmSettings,
  SetSpaceTopics,
  SpaceDetail,
  SpaceLinkBody,
  SpaceLinkParam,
  UpdateCommunity,
  UpdateSpace,
} from '../schemas/index.js';

const errors = { 401: ErrorBody, 403: ErrorBody, 404: ErrorBody, 409: ErrorBody };

export async function communitiesRoutes(app: FastifyInstance, container: Container): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const content = container.content;
  const tags = ['Communities'];

  r.route({
    method: 'GET',
    url: '/api/communities',
    schema: {
      operationId: 'listCommunities',
      tags,
      summary: 'List communities',
      querystring: CommunitiesQuery,
      response: { 200: CommunitiesPage, ...errors },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return content.listCommunities(scope.orgId, req.query);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/communities',
    schema: {
      operationId: 'createCommunity',
      tags,
      summary: 'Create a community',
      body: CreateCommunity,
      response: { 201: Community, ...errors },
    },
    handler: async (req, reply) => {
      const scope = await resolveScope(container, req);
      const community = await content.createCommunity(scope.orgId, req.body, {
        id: scope.orgUserId,
        role: scope.role,
      });
      req.log.info({ communityId: community.id }, 'community created');
      return reply.code(201).send(community);
    },
  });

  r.route({
    method: 'GET',
    url: '/api/communities/:id',
    schema: {
      operationId: 'getCommunity',
      tags,
      summary: 'Get a community',
      params: CommunityIdParam,
      response: { 200: Community, ...errors },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      const community = await content.getCommunity(scope.orgId, req.params.id);
      if (!community) {
        throw new NotFoundError('Community', req.params.id);
      }
      return community;
    },
  });

  r.route({
    method: 'PATCH',
    url: '/api/communities/:id',
    schema: {
      operationId: 'updateCommunity',
      tags,
      summary: 'Update a community',
      params: CommunityIdParam,
      body: UpdateCommunity,
      response: { 200: Community, ...errors },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return content.updateCommunity(scope.orgId, req.params.id, req.body, {
        id: scope.orgUserId,
        role: scope.role,
      });
    },
  });

  r.route({
    method: 'DELETE',
    url: '/api/communities/:id',
    schema: {
      operationId: 'deleteCommunity',
      tags,
      summary: 'Delete a community',
      params: CommunityIdParam,
      response: { 204: z.void(), ...errors },
    },
    handler: async (req, reply) => {
      const scope = await resolveScope(container, req);
      await content.deleteCommunity(scope.orgId, req.params.id, {
        id: scope.orgUserId,
        role: scope.role,
      });
      return reply.code(204).send();
    },
  });

  r.route({
    method: 'PATCH',
    url: '/api/communities/:id/settings',
    schema: {
      operationId: 'patchCommunityDmSettings',
      tags,
      summary: 'Change direct-message settings for a community',
      params: CommunityIdParam,
      body: PatchDmSettings,
      response: { 200: Community, ...errors },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return content.patchDmSettings(scope.orgId, req.params.id, req.body, {
        id: scope.orgUserId,
        role: scope.role,
      });
    },
  });

  r.route({
    method: 'POST',
    url: '/api/communities/:id/publish',
    schema: {
      operationId: 'publishCommunity',
      tags,
      summary: 'Publish a community',
      params: CommunityIdParam,
      response: { 200: Community, ...errors },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return content.publishCommunity(scope.orgId, req.params.id, {
        id: scope.orgUserId,
        role: scope.role,
      });
    },
  });

  r.route({
    method: 'POST',
    url: '/api/communities/:id/unpublish',
    schema: {
      operationId: 'unpublishCommunity',
      tags,
      summary: 'Unpublish a community',
      params: CommunityIdParam,
      response: { 200: Community, ...errors },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return content.unpublishCommunity(scope.orgId, req.params.id, {
        id: scope.orgUserId,
        role: scope.role,
      });
    },
  });

  r.route({
    method: 'GET',
    url: '/api/communities/:id/analytics',
    schema: {
      operationId: 'getCommunityAnalytics',
      tags,
      summary: 'Staff analytics for a community',
      params: CommunityIdParam,
      response: { 200: CommunityAnalytics, ...errors },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      const stats = await container.reporting.admin.communityAnalytics(scope.orgId, req.params.id);
      if (!stats) {
        throw new NotFoundError('Community', req.params.id);
      }
      return stats;
    },
  });

  r.route({
    method: 'GET',
    url: '/api/communities/:id/message-queue',
    schema: {
      operationId: 'getCommunityMessageQueue',
      tags,
      summary: 'Open message flags in a community',
      params: CommunityIdParam,
      response: { 200: MessageQueue, ...errors },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return container.chats.messageQueue(scope.orgId, { id: scope.orgUserId, role: scope.role }, req.params.id);
    },
  });

  r.route({
    method: 'GET',
    url: '/api/communities/:id/spaces',
    schema: {
      operationId: 'listCommunitySpaces',
      tags,
      summary: 'List the spaces in a community',
      params: CommunityIdParam,
      response: { 200: z.array(SpaceDetail), ...errors },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return content.listSpaces(scope.orgId, req.params.id);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/communities/:id/spaces',
    schema: {
      operationId: 'createSpace',
      tags,
      summary: 'Create a space',
      params: CommunityIdParam,
      body: CreateSpace,
      response: { 201: SpaceDetail, ...errors },
    },
    handler: async (req, reply) => {
      const scope = await resolveScope(container, req);
      const space = await content.createSpace(scope.orgId, req.params.id, req.body, {
        id: scope.orgUserId,
        role: scope.role,
      });
      return reply.code(201).send(space);
    },
  });

  r.route({
    method: 'PUT',
    url: '/api/communities/:id/spaces/order',
    schema: {
      operationId: 'reorderSpaces',
      tags,
      summary: 'Reorder the spaces in a community',
      params: CommunityIdParam,
      body: OrderedIds,
      response: { 200: z.array(SpaceDetail), ...errors },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return content.reorderSpaces(scope.orgId, req.params.id, req.body.ids, {
        id: scope.orgUserId,
        role: scope.role,
      });
    },
  });

  r.route({
    method: 'GET',
    url: '/api/communities/:communityId/spaces/:spaceId',
    schema: {
      operationId: 'getSpace',
      tags,
      summary: 'Get a space',
      params: CommunitySpaceParam,
      response: { 200: SpaceDetail, ...errors },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      const space = await content.getSpace(scope.orgId, req.params.spaceId);
      if (!space || space.communityId !== req.params.communityId) {
        throw new NotFoundError('Space', req.params.spaceId);
      }
      return space;
    },
  });

  r.route({
    method: 'PATCH',
    url: '/api/communities/:communityId/spaces/:spaceId',
    schema: {
      operationId: 'updateSpace',
      tags,
      summary: 'Update a space',
      params: CommunitySpaceParam,
      body: UpdateSpace,
      response: { 200: SpaceDetail, ...errors },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return content.updateSpace(
        scope.orgId,
        req.params.communityId,
        req.params.spaceId,
        req.body,
        { id: scope.orgUserId, role: scope.role },
      );
    },
  });

  r.route({
    method: 'DELETE',
    url: '/api/communities/:communityId/spaces/:spaceId',
    schema: {
      operationId: 'deleteSpace',
      tags,
      summary: 'Delete a space',
      params: CommunitySpaceParam,
      response: { 204: z.void(), ...errors },
    },
    handler: async (req, reply) => {
      const scope = await resolveScope(container, req);
      await content.deleteSpace(scope.orgId, req.params.communityId, req.params.spaceId, {
        id: scope.orgUserId,
        role: scope.role,
      });
      return reply.code(204).send();
    },
  });

  r.route({
    method: 'PUT',
    url: '/api/communities/:communityId/spaces/:spaceId/topics',
    schema: {
      operationId: 'setSpaceTopics',
      tags,
      summary: 'Replace the topics on a space',
      params: CommunitySpaceParam,
      body: SetSpaceTopics,
      response: { 200: SpaceDetail, ...errors },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return content.setSpaceTopics(
        scope.orgId,
        req.params.communityId,
        req.params.spaceId,
        req.body,
        { id: scope.orgUserId, role: scope.role },
      );
    },
  });

  r.route({
    method: 'POST',
    url: '/api/communities/:communityId/spaces/:spaceId/links',
    schema: {
      operationId: 'addSpaceLink',
      tags,
      summary: 'Link a course, download, or community into a space',
      params: CommunitySpaceParam,
      body: SpaceLinkBody,
      response: { 201: SpaceDetail, ...errors },
    },
    handler: async (req, reply) => {
      const scope = await resolveScope(container, req);
      const space = await content.addSpaceLink(
        scope.orgId,
        req.params.communityId,
        req.params.spaceId,
        req.body.contentId,
        { id: scope.orgUserId, role: scope.role },
      );
      return reply.code(201).send(space);
    },
  });

  r.route({
    method: 'DELETE',
    url: '/api/communities/:communityId/spaces/:spaceId/links/:linkId',
    schema: {
      operationId: 'removeSpaceLink',
      tags,
      summary: 'Remove a link from a space',
      params: SpaceLinkParam,
      response: { 200: SpaceDetail, ...errors },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return content.removeSpaceLink(
        scope.orgId,
        req.params.communityId,
        req.params.spaceId,
        req.params.linkId,
        { id: scope.orgUserId, role: scope.role },
      );
    },
  });

  r.route({
    method: 'PUT',
    url: '/api/communities/:communityId/spaces/:spaceId/links/order',
    schema: {
      operationId: 'reorderSpaceLinks',
      tags,
      summary: 'Reorder the links in a space',
      params: CommunitySpaceParam,
      body: OrderedIds,
      response: { 200: SpaceDetail, ...errors },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return content.reorderSpaceLinks(
        scope.orgId,
        req.params.communityId,
        req.params.spaceId,
        req.body.ids,
        { id: scope.orgUserId, role: scope.role },
      );
    },
  });
}
