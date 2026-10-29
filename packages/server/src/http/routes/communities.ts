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
  MessageQueue,
  OrderedIds,
  PatchDmSettings,
  SetSpaceTopics,
  SpaceDetail,
  SpaceLinkBody,
  SpaceLinkParam,
  UpdateCommunity,
  UpdateSpace,
  refusals,
} from '../schemas/index.js';

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
      summary: 'List communities (staff)',
      description:
        'Staff only (owner, admin, instructor). Pages every community in the organization, drafts included, filtered by `status` and searched by title.',
      querystring: CommunitiesQuery,
      response: { 200: CommunitiesPage, ...refusals(403) },
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
      summary: 'Create a community (staff)',
      description:
        'Owner or admin only. The community starts as a draft with the default direct-message settings and no spaces. Members see it once it is published and they hold it.',
      body: CreateCommunity,
      response: { 201: Community, ...refusals(403, 409) },
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
    url: '/api/communities/:communityId',
    schema: {
      operationId: 'getCommunity',
      tags,
      summary: 'Get a community (staff)',
      description:
        'Staff only (owner, admin, instructor). Any community of the organization, drafts included.',
      params: CommunityIdParam,
      response: { 200: Community, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      const community = await content.getCommunity(scope.orgId, req.params.communityId);
      if (!community) {
        throw new NotFoundError('Community', req.params.communityId);
      }
      return community;
    },
  });

  r.route({
    method: 'PATCH',
    url: '/api/communities/:communityId',
    schema: {
      operationId: 'updateCommunity',
      tags,
      summary: 'Update a community (staff)',
      description:
        'Owner or admin only. Changes only the fields sent. `thumbnailAssetId` must be a ready library image (409 otherwise); null clears it.',
      params: CommunityIdParam,
      body: UpdateCommunity,
      response: { 200: Community, ...refusals(403, 404, 409) },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return content.updateCommunity(scope.orgId, req.params.communityId, req.body, {
        id: scope.orgUserId,
        role: scope.role,
      });
    },
  });

  r.route({
    method: 'DELETE',
    url: '/api/communities/:communityId',
    schema: {
      operationId: 'deleteCommunity',
      tags,
      summary: 'Delete a community (staff)',
      description:
        'Owner or admin only. Links to the community from other spaces are removed with it.',
      params: CommunityIdParam,
      response: { 204: z.void(), ...refusals(403, 404) },
    },
    handler: async (req, reply) => {
      const scope = await resolveScope(container, req);
      await content.deleteCommunity(scope.orgId, req.params.communityId, {
        id: scope.orgUserId,
        role: scope.role,
      });
      return reply.code(204).send();
    },
  });

  r.route({
    method: 'PATCH',
    url: '/api/communities/:communityId/settings',
    schema: {
      operationId: 'patchCommunityDmSettings',
      tags,
      summary: 'Change direct-message settings for a community (staff)',
      description:
        'Owner or admin only. Changes only the settings sent; the rest keep their values. They decide who may message whom from then on.',
      params: CommunityIdParam,
      body: PatchDmSettings,
      response: { 200: Community, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return content.patchDmSettings(scope.orgId, req.params.communityId, req.body, {
        id: scope.orgUserId,
        role: scope.role,
      });
    },
  });

  r.route({
    method: 'POST',
    url: '/api/communities/:communityId/publish',
    schema: {
      operationId: 'publishCommunity',
      tags,
      summary: 'Publish a community (staff)',
      description: 'Owner or admin only. Makes the community visible to the people who hold it.',
      params: CommunityIdParam,
      response: { 200: Community, ...refusals(403, 404, 409) },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return content.publishCommunity(scope.orgId, req.params.communityId, {
        id: scope.orgUserId,
        role: scope.role,
      });
    },
  });

  r.route({
    method: 'POST',
    url: '/api/communities/:communityId/unpublish',
    schema: {
      operationId: 'unpublishCommunity',
      tags,
      summary: 'Unpublish a community (staff)',
      description:
        'Owner or admin only. Hides the community from members again; nothing in it is deleted.',
      params: CommunityIdParam,
      response: { 200: Community, ...refusals(403, 404, 409) },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return content.unpublishCommunity(scope.orgId, req.params.communityId, {
        id: scope.orgUserId,
        role: scope.role,
      });
    },
  });

  r.route({
    method: 'GET',
    url: '/api/communities/:communityId/analytics',
    schema: {
      operationId: 'getCommunityAnalytics',
      tags,
      summary: 'Staff analytics for a community',
      description:
        'Staff only (owner, admin, instructor). Membership, activity and moderation counts for one community.',
      params: CommunityIdParam,
      response: { 200: CommunityAnalytics, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      const stats = await container.reporting.admin.communityAnalytics(
        scope.orgId,
        req.params.communityId,
      );
      if (!stats) {
        throw new NotFoundError('Community', req.params.communityId);
      }
      return stats;
    },
  });

  r.route({
    method: 'GET',
    url: '/api/communities/:communityId/message-queue',
    schema: {
      operationId: 'getCommunityMessageQueue',
      tags,
      summary: 'Open message flags in a community (staff)',
      description:
        "Staff only (owner, admin, instructor). Every message in the community's chats that has open flags, with the flags and the chat it is in.",
      params: CommunityIdParam,
      response: { 200: MessageQueue, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return container.chats.messageQueue(
        scope.orgId,
        { id: scope.orgUserId, role: scope.role },
        req.params.communityId,
      );
    },
  });

  r.route({
    method: 'GET',
    url: '/api/communities/:communityId/spaces',
    schema: {
      operationId: 'listCommunitySpaces',
      tags,
      summary: 'List the spaces in a community (staff)',
      description:
        'Staff only (owner, admin, instructor). Every space in order, with its topics and links.',
      params: CommunityIdParam,
      response: { 200: z.array(SpaceDetail), ...refusals(403, 404) },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return content.listSpaces(scope.orgId, req.params.communityId);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/communities/:communityId/spaces',
    schema: {
      operationId: 'createSpace',
      tags,
      summary: 'Create a space (staff)',
      description:
        'Owner or admin only. The space is added last. An `all_members` space cannot have a capacity (409).',
      params: CommunityIdParam,
      body: CreateSpace,
      response: { 201: SpaceDetail, ...refusals(403, 404, 409) },
    },
    handler: async (req, reply) => {
      const scope = await resolveScope(container, req);
      const space = await content.createSpace(scope.orgId, req.params.communityId, req.body, {
        id: scope.orgUserId,
        role: scope.role,
      });
      return reply.code(201).send(space);
    },
  });

  r.route({
    method: 'PUT',
    url: '/api/communities/:communityId/spaces/order',
    schema: {
      operationId: 'reorderSpaces',
      tags,
      summary: 'Reorder the spaces in a community (staff)',
      description:
        'Owner or admin only. Send every space id of the community exactly once (409 otherwise).',
      params: CommunityIdParam,
      body: OrderedIds,
      response: { 200: z.array(SpaceDetail), ...refusals(403, 404, 409) },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return content.reorderSpaces(scope.orgId, req.params.communityId, req.body.ids, {
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
      summary: 'Get a space (staff)',
      description: 'Staff only (owner, admin, instructor). The space with its topics and links.',
      params: CommunitySpaceParam,
      response: { 200: SpaceDetail, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      const space = await content.getCommunitySpace(
        scope.orgId,
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
    method: 'PATCH',
    url: '/api/communities/:communityId/spaces/:spaceId',
    schema: {
      operationId: 'updateSpace',
      tags,
      summary: 'Update a space (staff)',
      description:
        'Owner or admin only. Changes only the fields sent; `settings` merges into the current settings. An `all_members` space cannot have a capacity (409).',
      params: CommunitySpaceParam,
      body: UpdateSpace,
      response: { 200: SpaceDetail, ...refusals(403, 404, 409) },
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
      summary: 'Delete a space (staff)',
      description: 'Owner or admin only. The space and everything in it go.',
      params: CommunitySpaceParam,
      response: { 204: z.void(), ...refusals(403, 404) },
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
      summary: 'Replace the topics on a space (staff)',
      description:
        'Owner or admin only. The list replaces the current topics: an entry with an `id` keeps and renames that topic, one without adds a topic, and a topic left out is deleted. Names must be unique (409), and a topic that posts use cannot be deleted (409).',
      params: CommunitySpaceParam,
      body: SetSpaceTopics,
      response: { 200: SpaceDetail, ...refusals(403, 404, 409) },
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
      summary: 'Link a course, download, or community into a space (staff)',
      description:
        'Owner or admin only. The link is added last. Linking the same content twice is a 409.',
      params: CommunitySpaceParam,
      body: SpaceLinkBody,
      response: { 201: SpaceDetail, ...refusals(403, 404, 409) },
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
      summary: 'Remove a link from a space (staff)',
      description: 'Owner or admin only. The linked content itself is untouched.',
      params: SpaceLinkParam,
      response: { 200: SpaceDetail, ...refusals(403, 404) },
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
      summary: 'Reorder the links in a space (staff)',
      description:
        'Owner or admin only. Send every link id of the space exactly once (409 otherwise).',
      params: CommunitySpaceParam,
      body: OrderedIds,
      response: { 200: SpaceDetail, ...refusals(403, 404, 409) },
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
