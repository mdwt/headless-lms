import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Container } from '../../app/container.js';
import { resolveActor } from '../scope.js';
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
  NotificationCategoryList,
  OrderedIds,
  PatchCommunitySettings,
  ReplaceNotificationCategories,
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
      summary: 'List communities',
      description: `Requires one of \`communities:read\`, \`communities:moderate\`. Pages every community in the organization, drafts included, filtered by \`status\` and searched by title.`,
      querystring: CommunitiesQuery,
      response: { 200: CommunitiesPage, ...refusals(403) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return content.listCommunities(req.query, actor);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/communities',
    schema: {
      operationId: 'createCommunity',
      tags,
      summary: 'Create a community',
      description: `Requires \`communities:write\`. The community starts as a draft with the default direct-message settings and no spaces. Members see it once it is published and they hold it.`,
      body: CreateCommunity,
      response: { 201: Community, ...refusals(403, 409) },
    },
    handler: async (req, reply) => {
      const actor = await resolveActor(container, req);
      const community = await content.createCommunity(req.body, actor);
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
      summary: 'Get a community',
      description: `Requires one of \`communities:read\`, \`communities:moderate\`. Any community of the organization, drafts included.`,
      params: CommunityIdParam,
      response: { 200: Community, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return content.getCommunity(req.params.communityId, actor);
    },
  });

  r.route({
    method: 'PATCH',
    url: '/api/communities/:communityId',
    schema: {
      operationId: 'updateCommunity',
      tags,
      summary: 'Update a community',
      description: `Requires \`communities:write\`. Changes only the fields sent. \`thumbnailAssetId\` must be a ready library image (409 otherwise); null clears it. A file it does not already use must be uploaded for it, or the caller needs \`media:read\` (403 otherwise).`,
      params: CommunityIdParam,
      body: UpdateCommunity,
      response: { 200: Community, ...refusals(403, 404, 409) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return content.updateCommunity(req.params.communityId, req.body, actor);
    },
  });

  r.route({
    method: 'DELETE',
    url: '/api/communities/:communityId',
    schema: {
      operationId: 'deleteCommunity',
      tags,
      summary: 'Delete a community',
      description: `Requires \`communities:delete\`. Links to the community from other spaces are removed with it.`,
      params: CommunityIdParam,
      response: { 204: z.void(), ...refusals(403, 404) },
    },
    handler: async (req, reply) => {
      const actor = await resolveActor(container, req);
      await content.deleteCommunity(req.params.communityId, actor);
      return reply.code(204).send();
    },
  });

  r.route({
    method: 'PATCH',
    url: '/api/communities/:communityId/settings',
    schema: {
      operationId: 'patchCommunitySettings',
      tags,
      summary: 'Change the direct-message and digest settings of a community',
      description: `Requires \`communities:write\`. Changes only the settings sent; the rest keep their values. The direct-message settings decide who may message whom from then on. \`digest\` sets when the community digest goes out, or \`null\` stops it; the first digest after a change goes out at the next slot.`,
      params: CommunityIdParam,
      body: PatchCommunitySettings,
      response: { 200: Community, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return content.patchCommunitySettings(req.params.communityId, req.body, actor);
    },
  });

  r.route({
    method: 'GET',
    url: '/api/communities/:communityId/notification-categories',
    schema: {
      operationId: 'getCommunityNotificationCategories',
      tags: ['Notifications'],
      summary: "Get a community's notification categories",
      description: `Requires \`communities:read\`. On the community. The list in use for the community, with \`source\` saying whether it is the default or a stored list.`,
      params: CommunityIdParam,
      response: { 200: NotificationCategoryList, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return container.notificationCategories.community.get(req.params.communityId, actor);
    },
  });

  r.route({
    method: 'PUT',
    url: '/api/communities/:communityId/notification-categories',
    schema: {
      operationId: 'replaceCommunityNotificationCategories',
      tags: ['Notifications'],
      summary: "Replace a community's notification categories",
      description: `Requires \`communities:write\`. On the community. Stores the whole list for this community; other communities keep theirs. 422 when a key repeats, a type cannot be in a community list, a reason is not allowed for its type, a channel is not configured, \`perSpace\` is set on a type that cannot occur in a space, \`spaceDefaults\` appears without \`perSpace\` or names a channel the category does not offer, or earlier categories already cover everything a category covers.`,
      params: CommunityIdParam,
      body: ReplaceNotificationCategories,
      response: { 200: NotificationCategoryList, ...refusals(400, 403, 404, 422) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return container.notificationCategories.community.replace(
        req.params.communityId,
        req.body.categories,
        actor,
      );
    },
  });

  r.route({
    method: 'DELETE',
    url: '/api/communities/:communityId/notification-categories',
    schema: {
      operationId: 'resetCommunityNotificationCategories',
      tags: ['Notifications'],
      summary: 'Go back to the default notification categories for a community',
      description: `Requires \`communities:write\`. On the community. Removes the stored list; the default applies again.`,
      params: CommunityIdParam,
      response: { 204: z.void(), ...refusals(403, 404) },
    },
    handler: async (req, reply) => {
      const actor = await resolveActor(container, req);
      await container.notificationCategories.community.reset(req.params.communityId, actor);
      return reply.code(204).send();
    },
  });

  r.route({
    method: 'POST',
    url: '/api/communities/:communityId/publish',
    schema: {
      operationId: 'publishCommunity',
      tags,
      summary: 'Publish a community',
      description: `Requires \`communities:write\`. Makes the community visible to the people who hold it.`,
      params: CommunityIdParam,
      response: { 200: Community, ...refusals(403, 404, 409) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return content.publishCommunity(req.params.communityId, actor);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/communities/:communityId/unpublish',
    schema: {
      operationId: 'unpublishCommunity',
      tags,
      summary: 'Unpublish a community',
      description: `Requires \`communities:write\`. Hides the community from members again; nothing in it is deleted.`,
      params: CommunityIdParam,
      response: { 200: Community, ...refusals(403, 404, 409) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return content.unpublishCommunity(req.params.communityId, actor);
    },
  });

  r.route({
    method: 'GET',
    url: '/api/communities/:communityId/analytics',
    schema: {
      operationId: 'getCommunityAnalytics',
      tags,
      summary: 'Analytics for a community',
      description: `Requires \`communities:read\`. Membership, activity and moderation counts for one community.`,
      params: CommunityIdParam,
      response: { 200: CommunityAnalytics, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return container.reporting.admin.communityAnalytics(req.params.communityId, actor);
    },
  });

  r.route({
    method: 'GET',
    url: '/api/communities/:communityId/message-queue',
    schema: {
      operationId: 'getCommunityMessageQueue',
      tags,
      summary: 'Open message flags in a community',
      description: `Requires \`communities:moderate\`. The messages in the community's chats with open flags, with the flags and the chat each is in. Holds at most the 100 oldest open flags; working the queue brings in the next ones.`,
      params: CommunityIdParam,
      response: { 200: MessageQueue, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return container.chats.messageQueue(req.params.communityId, actor);
    },
  });

  r.route({
    method: 'GET',
    url: '/api/communities/:communityId/spaces',
    schema: {
      operationId: 'listCommunitySpaces',
      tags,
      summary: 'List the spaces in a community',
      description: `Requires one of \`communities:read\`, \`communities:moderate\`. Every space in order, with its topics and links.`,
      params: CommunityIdParam,
      response: { 200: z.array(SpaceDetail), ...refusals(403, 404) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return content.listSpaces(req.params.communityId, actor);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/communities/:communityId/spaces',
    schema: {
      operationId: 'createSpace',
      tags,
      summary: 'Create a space',
      description: `Requires \`communities:write\`. The space is added last. An \`all_members\` space cannot have a capacity (409).`,
      params: CommunityIdParam,
      body: CreateSpace,
      response: { 201: SpaceDetail, ...refusals(403, 404, 409) },
    },
    handler: async (req, reply) => {
      const actor = await resolveActor(container, req);
      const space = await content.createSpace(req.params.communityId, req.body, actor);
      return reply.code(201).send(space);
    },
  });

  r.route({
    method: 'PUT',
    url: '/api/communities/:communityId/spaces/order',
    schema: {
      operationId: 'reorderSpaces',
      tags,
      summary: 'Reorder the spaces in a community',
      description: `Requires \`communities:write\`. Send every space id of the community exactly once (409 otherwise).`,
      params: CommunityIdParam,
      body: OrderedIds,
      response: { 200: z.array(SpaceDetail), ...refusals(403, 404, 409) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return content.reorderSpaces(req.params.communityId, req.body.ids, actor);
    },
  });

  r.route({
    method: 'GET',
    url: '/api/communities/:communityId/spaces/:spaceId',
    schema: {
      operationId: 'getSpace',
      tags,
      summary: 'Get a space',
      description: `Requires \`communities:read\`. The space with its topics and links.`,
      params: CommunitySpaceParam,
      response: { 200: SpaceDetail, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return content.getCommunitySpace(req.params.communityId, req.params.spaceId, actor);
    },
  });

  r.route({
    method: 'PATCH',
    url: '/api/communities/:communityId/spaces/:spaceId',
    schema: {
      operationId: 'updateSpace',
      tags,
      summary: 'Update a space',
      description: `Requires \`communities:write\`. Changes only the fields sent; \`settings\` merges into the current settings. An \`all_members\` space cannot have a capacity (409).`,
      params: CommunitySpaceParam,
      body: UpdateSpace,
      response: { 200: SpaceDetail, ...refusals(403, 404, 409) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return content.updateSpace(req.params.communityId, req.params.spaceId, req.body, actor);
    },
  });

  r.route({
    method: 'DELETE',
    url: '/api/communities/:communityId/spaces/:spaceId',
    schema: {
      operationId: 'deleteSpace',
      tags,
      summary: 'Delete a space',
      description: `Requires \`communities:write\`. The space and everything in it go.`,
      params: CommunitySpaceParam,
      response: { 204: z.void(), ...refusals(403, 404) },
    },
    handler: async (req, reply) => {
      const actor = await resolveActor(container, req);
      await content.deleteSpace(req.params.communityId, req.params.spaceId, actor);
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
      description: `Requires \`communities:write\`. The list replaces the current topics: an entry with an \`id\` keeps and renames that topic, one without adds a topic, and a topic left out is deleted. Names must be unique (409), and a topic that posts use cannot be deleted (409).`,
      params: CommunitySpaceParam,
      body: SetSpaceTopics,
      response: { 200: SpaceDetail, ...refusals(403, 404, 409) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return content.setSpaceTopics(req.params.communityId, req.params.spaceId, req.body, actor);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/communities/:communityId/spaces/:spaceId/links',
    schema: {
      operationId: 'addSpaceLink',
      tags,
      summary: 'Link a course, download, or community into a space',
      description: `Requires \`communities:write\`. The link is added last. Linking the same content twice is a 409.`,
      params: CommunitySpaceParam,
      body: SpaceLinkBody,
      response: { 201: SpaceDetail, ...refusals(403, 404, 409) },
    },
    handler: async (req, reply) => {
      const actor = await resolveActor(container, req);
      const space = await content.addSpaceLink(
        req.params.communityId,
        req.params.spaceId,
        req.body.contentId,
        actor,
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
      description: `Requires \`communities:write\`. The linked content itself is untouched.`,
      params: SpaceLinkParam,
      response: { 200: SpaceDetail, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return content.removeSpaceLink(
        req.params.communityId,
        req.params.spaceId,
        req.params.linkId,
        actor,
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
      description: `Requires \`communities:write\`. Send every link id of the space exactly once (409 otherwise).`,
      params: CommunitySpaceParam,
      body: OrderedIds,
      response: { 200: SpaceDetail, ...refusals(403, 404, 409) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return content.reorderSpaceLinks(
        req.params.communityId,
        req.params.spaceId,
        req.body.ids,
        actor,
      );
    },
  });
}
