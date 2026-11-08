import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  AddEventAsset,
  AddEventAttendee,
  CreateEvent,
  Event,
  EventAnalytics,
  EventAttendeesPage,
  EventAssetParams,
  EventAttendeeParams,
  EventFile,
  EventIdParam,
  EventsPage,
  EventsQuery,
  PageQuery,
  RenameEventAsset,
  ReorderEventAssets,
  UpdateEvent,
  refusals,
} from '../schemas/index.js';
import type { Container } from '../../app/container.js';
import { resolveActor } from '../scope.js';
import { describeOperation } from '../operations.js';

export async function eventsRoutes(app: FastifyInstance, container: Container): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const content = container.content;

  r.route({
    method: 'GET',
    url: '/api/events',
    config: { operation: 'content.listEvents' },
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'listEvents',
      tags: ['Events'],
      summary: 'List events',
      description: `${describeOperation('content.listEvents')} Every event the caller holds \`events:read\` on, drafts and canceled included. \`from\` and \`to\` keep the events that overlap the range.`,
      querystring: EventsQuery,
      response: { 200: EventsPage, ...refusals(400, 403) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return content.listEvents(req.query, actor);
    },
  });

  r.route({
    method: 'GET',
    url: '/api/events/:eventId',
    config: { operation: 'content.getEvent' },
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'getEvent',
      tags: ['Events'],
      summary: 'Get an event',
      description: describeOperation('content.getEvent'),
      params: EventIdParam,
      response: { 200: Event, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return content.getEvent(req.params.eventId, actor);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/events',
    config: { operation: 'content.createEvent' },
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'createEvent',
      tags: ['Events'],
      summary: 'Create an event',
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
    url: '/api/events/:eventId',
    config: { operation: 'content.updateEvent' },
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'updateEvent',
      tags: ['Events'],
      summary: 'Update an event',
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
    url: '/api/events/:eventId/cancel',
    config: { operation: 'content.cancelEvent' },
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'cancelEvent',
      tags: ['Events'],
      summary: 'Cancel an event',
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
    url: '/api/events/:eventId',
    config: { operation: 'content.deleteEvent' },
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'deleteEvent',
      tags: ['Events'],
      summary: 'Delete an event',
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
    url: '/api/events/:eventId/assets',
    config: { operation: 'content.listEventAssets' },
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'listEventAssets',
      tags: ['Events'],
      summary: "List an event's files in order",
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
    url: '/api/events/:eventId/assets',
    config: { operation: 'content.addEventAsset' },
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'addEventAsset',
      tags: ['Events'],
      summary: 'Attach a file to an event',
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
    url: '/api/events/:eventId/assets/order',
    config: { operation: 'content.reorderEventAssets' },
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'reorderEventAssets',
      tags: ['Events'],
      summary: "Reorder an event's files",
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
    url: '/api/events/:eventId/assets/:assetId',
    config: { operation: 'content.renameEventAsset' },
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'renameEventAsset',
      tags: ['Events'],
      summary: "Set a file's display name within an event",
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
    url: '/api/events/:eventId/assets/:assetId',
    config: { operation: 'content.removeEventAsset' },
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'removeEventAsset',
      tags: ['Events'],
      summary: 'Remove a file from an event',
      description: `${describeOperation('content.removeEventAsset')} The library file itself survives. Returns the event's files.`,
      params: EventAssetParams,
      response: { 200: z.array(EventFile), ...refusals(403, 404) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return content.removeEventAsset(req.params.eventId, req.params.assetId, actor);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/events/:eventId/attendees',
    config: { operation: 'entitlements.grant' },
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'addEventAttendee',
      tags: ['Events'],
      summary: 'Add an attendee to an event',
      description:
        'Requires `access:write`, or `events:write` on the event or the org. Grants the event to the person, with source `manual`. Adding someone who already attends changes nothing. 404 when the event or the person does not exist; 409 `not_published`, `ended` or `full`.',
      params: EventIdParam,
      body: AddEventAttendee,
      response: { 204: z.void(), ...refusals(400, 403, 404, 409) },
    },
    handler: async (req, reply) => {
      const actor = await resolveActor(container, req);
      await container.entitlements.grant(
        {
          orgUserId: req.body.orgUserId,
          contentId: req.params.eventId,
          contentType: 'event',
          expiresAt: null,
        },
        actor,
      );
      return reply.code(204).send();
    },
  });

  r.route({
    method: 'DELETE',
    url: '/api/events/:eventId/attendees/:orgUserId',
    config: { operation: 'entitlements.revoke' },
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'removeEventAttendee',
      tags: ['Events'],
      summary: 'Remove an attendee from an event',
      description:
        "Requires `access:write`, or `events:write` on the event or the org. Revokes the person's direct grant to the event. 404 when they have no direct active grant; someone who attends only through a bundle has none.",
      params: EventAttendeeParams,
      response: { 204: z.void(), ...refusals(403, 404) },
    },
    handler: async (req, reply) => {
      const actor = await resolveActor(container, req);
      await container.entitlements.revoke(
        { orgUserId: req.params.orgUserId, contentId: req.params.eventId, contentType: 'event' },
        actor,
      );
      return reply.code(204).send();
    },
  });

  r.route({
    method: 'GET',
    url: '/api/events/:eventId/attendees',
    config: { operation: 'reporting.admin.eventAttendees' },
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'listEventAttendees',
      tags: ['Events'],
      summary: "List an event's attendees",
      description: `${describeOperation('reporting.admin.eventAttendees')} On the event or the org. The people attending, directly or through a bundle, by grant date. \`source\` is \`bundle\` for someone who attends only through a bundle.`,
      params: EventIdParam,
      querystring: PageQuery,
      response: { 200: EventAttendeesPage, ...refusals(400, 403, 404) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return container.reporting.admin.eventAttendees(req.params.eventId, req.query, actor);
    },
  });

  r.route({
    method: 'GET',
    url: '/api/events/:eventId/analytics',
    config: { operation: 'reporting.admin.eventAnalytics' },
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'getEventAnalytics',
      tags: ['Events'],
      summary: "An event's attendance figures",
      description: `${describeOperation('reporting.admin.eventAnalytics')} On the event or the org. The attendees now and by source, the capacity, the revoked direct grants, and the current direct grants by grant date before the start.`,
      params: EventIdParam,
      response: { 200: EventAnalytics, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return container.reporting.admin.eventAnalytics(req.params.eventId, actor);
    },
  });
}
