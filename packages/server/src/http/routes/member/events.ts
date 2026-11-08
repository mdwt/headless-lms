import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  AddEventAsset,
  CreateEvent,
  Event,
  EventAssetParams,
  EventFile,
  EventIdParam,
  RenameEventAsset,
  ReorderEventAssets,
  UpdateEvent,
  refusals,
} from '../../schemas/index.js';
import type { Container } from '../../../app/container.js';
import { resolveActor } from '../../scope.js';
import { describeOperation } from '../../operations.js';

export async function memberEventsRoutes(
  app: FastifyInstance,
  container: Container,
): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const content = container.content;

  r.route({
    method: 'POST',
    url: '/api/member/events',
    config: { operation: 'content.createEvent' },
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'createMemberEvent',
      tags: ['Events'],
      summary: 'Create an event from the member app',
      description: `${describeOperation('content.createEvent')} The event starts as a draft. 400 when it ends before it starts.`,
      body: CreateEvent,
      response: { 201: Event, ...refusals(400, 403) },
    },
    handler: async (req, reply) => {
      const actor = await resolveActor(container, req);
      const event = await content.createEvent(req.body, actor);
      return reply.code(201).send(event);
    },
  });

  r.route({
    method: 'PATCH',
    url: '/api/member/events/:eventId',
    config: { operation: 'content.updateEvent' },
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'updateMemberEvent',
      tags: ['Events'],
      summary: 'Update an event you run',
      description: `${describeOperation('content.updateEvent')} Changes only the fields sent; \`status\` publishes or unpublishes it. \`thumbnailAssetId\` must be a ready library image (409 \`conflict\` otherwise); null clears it. A file it does not already use must be uploaded for it, or the caller needs \`media:read\` (403 otherwise). 409 \`canceled\` when the event is canceled.`,
      params: EventIdParam,
      body: UpdateEvent,
      response: { 200: Event, ...refusals(400, 403, 404, 409) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return content.updateEvent(req.params.eventId, req.body, actor);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/member/events/:eventId/cancel',
    config: { operation: 'content.cancelEvent' },
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'cancelMemberEvent',
      tags: ['Events'],
      summary: 'Cancel an event you run',
      description: `${describeOperation('content.cancelEvent')} Canceling is final. 409 \`canceled\` when it is already canceled.`,
      params: EventIdParam,
      response: { 200: Event, ...refusals(403, 404, 409) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return content.cancelEvent(req.params.eventId, actor);
    },
  });

  r.route({
    method: 'DELETE',
    url: '/api/member/events/:eventId',
    config: { operation: 'content.deleteEvent' },
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'deleteMemberEvent',
      tags: ['Events'],
      summary: 'Delete an event you can delete',
      description: `${describeOperation('content.deleteEvent')} Its attendees lose it; its library files survive.`,
      params: EventIdParam,
      response: { 204: z.void(), ...refusals(403, 404) },
    },
    handler: async (req, reply) => {
      const actor = await resolveActor(container, req);
      await content.deleteEvent(req.params.eventId, actor);
      return reply.code(204).send();
    },
  });

  r.route({
    method: 'GET',
    url: '/api/member/events/:eventId/assets',
    config: { operation: 'content.listEventAssets' },
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'listMemberEventAssets',
      tags: ['Events'],
      summary: 'List the files of an event you run, in order',
      description: describeOperation('content.listEventAssets'),
      params: EventIdParam,
      response: { 200: z.array(EventFile), ...refusals(403, 404) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return content.listEventAssets(req.params.eventId, actor);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/member/events/:eventId/assets',
    config: { operation: 'content.addEventAsset' },
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'addMemberEventAsset',
      tags: ['Events'],
      summary: 'Attach a file to an event you run',
      description: `${describeOperation('content.addEventAsset')} Added last. 409 when the file is not a ready library file or is already attached. A file not uploaded for the event needs \`media:read\` (403 otherwise). Returns the event's files.`,
      params: EventIdParam,
      body: AddEventAsset,
      response: { 200: z.array(EventFile), ...refusals(403, 404, 409) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return content.addEventAsset(req.params.eventId, req.body, actor);
    },
  });

  r.route({
    method: 'PUT',
    url: '/api/member/events/:eventId/assets/order',
    config: { operation: 'content.reorderEventAssets' },
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'reorderMemberEventAssets',
      tags: ['Events'],
      summary: 'Reorder the files of an event you run',
      description: `${describeOperation('content.reorderEventAssets')} Send every attached file id exactly once (409 otherwise). Returns the event's files.`,
      params: EventIdParam,
      body: ReorderEventAssets,
      response: { 200: z.array(EventFile), ...refusals(403, 404, 409) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return content.reorderEventAssets(req.params.eventId, req.body.assetIds, actor);
    },
  });

  r.route({
    method: 'PATCH',
    url: '/api/member/events/:eventId/assets/:assetId',
    config: { operation: 'content.renameEventAsset' },
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'renameMemberEventAsset',
      tags: ['Events'],
      summary: "Set a file's display name within an event you run",
      description: `${describeOperation('content.renameEventAsset')} Null falls back to the filename. Returns the event's files.`,
      params: EventAssetParams,
      body: RenameEventAsset,
      response: { 200: z.array(EventFile), ...refusals(403, 404) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return content.renameEventAsset(
        req.params.eventId,
        req.params.assetId,
        req.body.displayName,
        actor,
      );
    },
  });

  r.route({
    method: 'DELETE',
    url: '/api/member/events/:eventId/assets/:assetId',
    config: { operation: 'content.removeEventAsset' },
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'removeMemberEventAsset',
      tags: ['Events'],
      summary: 'Remove a file from an event you run',
      description: `${describeOperation('content.removeEventAsset')} The library file itself survives. Returns the event's files.`,
      params: EventAssetParams,
      response: { 200: z.array(EventFile), ...refusals(403, 404) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return content.removeEventAsset(req.params.eventId, req.params.assetId, actor);
    },
  });
}
