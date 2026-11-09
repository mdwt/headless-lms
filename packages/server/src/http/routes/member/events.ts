import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  AddEventAsset,
  AddEventAttendee,
  CreateEvent,
  Event,
  EventAssetParams,
  EventAttendeeParams,
  EventAttendeesPage,
  EventFile,
  EventIdParam,
  MemberEvent,
  MemberEventsPage,
  MemberEventsQuery,
  PageQuery,
  RenameEventAsset,
  ReorderEventAssets,
  UpdateEvent,
  refusals,
} from '../../schemas/index.js';
import type { Container } from '../../../app/container.js';
import { resolveActor } from '../../scope.js';

export async function memberEventsRoutes(
  app: FastifyInstance,
  container: Container,
): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const content = container.content;
  const member = container.reporting.member;

  r.route({
    method: 'GET',
    url: '/api/member/events',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'listMemberEvents',
      tags: ['Events'],
      summary: 'List the events you can see',
      description:
        'For a member of the organization. The published `public` events, and the published and canceled events you attend; with `events:read`, every published and canceled event it covers. Each as the event read returns it.',
      querystring: MemberEventsQuery,
      response: { 200: MemberEventsPage, ...refusals(400, 403) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return member.listEvents(req.query, actor);
    },
  });

  r.route({
    method: 'GET',
    url: '/api/member/events/:eventId',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'getMemberEvent',
      tags: ['Events'],
      summary: 'Get an event, with what you can do with it',
      description:
        'With `events:read` on the event or the org: the event in any status. As an attendee, directly or through a bundle: the published or canceled event, with the recording after the end when replay is on. Otherwise a published `public` event without its location, files and recording. 404 for anything else.',
      params: EventIdParam,
      response: { 200: MemberEvent, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return member.getEvent(req.params.eventId, actor);
    },
  });

  r.route({
    method: 'GET',
    url: '/api/member/events/:eventId/calendar',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'getEventCalendar',
      tags: ['Events'],
      summary: 'Download an event as a calendar file',
      description:
        'An iCalendar file with the title, the times and the event page. The location and the meeting link are included when the event read returns them. 404 when the event read does.',
      params: EventIdParam,
      response: {
        200: z.string().describe('`text/calendar`, one VEVENT'),
        ...refusals(403, 404),
      },
    },
    handler: async (req, reply) => {
      const actor = await resolveActor(container, req);
      const body = await member.eventCalendar(req.params.eventId, actor);
      return reply
        .header('content-type', 'text/calendar; charset=utf-8')
        .header('content-disposition', `attachment; filename="${req.params.eventId}.ics"`)
        .send(body);
    },
  });

  r.route({
    method: 'GET',
    url: '/api/member/events/:eventId/attendees',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'listMemberEventAttendees',
      tags: ['Events'],
      summary: 'List the attendees of an event you run',
      description: `Requires \`events:read\`. On the event or the org. The people attending, directly or through a bundle, by grant date. \`source\` is \`bundle\` for someone who attends only through a bundle.`,
      params: EventIdParam,
      querystring: PageQuery,
      response: { 200: EventAttendeesPage, ...refusals(400, 403, 404) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return member.eventAttendees(req.params.eventId, req.query, actor);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/member/events',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'createMemberEvent',
      tags: ['Events'],
      summary: 'Create an event from the member app',
      description: `Requires \`events:write\`. The event starts as a draft. 400 when it ends before it starts.`,
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
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'updateMemberEvent',
      tags: ['Events'],
      summary: 'Update an event you run',
      description: `Requires \`events:write\`. Changes only the fields sent; \`status\` publishes or unpublishes it. \`thumbnailAssetId\` must be a ready library image (409 \`conflict\` otherwise); null clears it. A file it does not already use must be uploaded for it, or the caller needs \`media:read\` (403 otherwise). 409 \`canceled\` when the event is canceled.`,
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
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'cancelMemberEvent',
      tags: ['Events'],
      summary: 'Cancel an event you run',
      description: `Requires \`events:write\`. Canceling is final. 409 \`canceled\` when it is already canceled.`,
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
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'deleteMemberEvent',
      tags: ['Events'],
      summary: 'Delete an event you can delete',
      description: `Requires \`events:delete\`. Its attendees lose it; its library files survive.`,
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
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'listMemberEventAssets',
      tags: ['Events'],
      summary: 'List the files of an event you run, in order',
      description: 'Requires `events:read`.',
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
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'addMemberEventAsset',
      tags: ['Events'],
      summary: 'Attach a file to an event you run',
      description: `Requires \`events:write\`. Added last. 409 when the file is not a ready library file or is already attached. A file not uploaded for the event needs \`media:read\` (403 otherwise). Returns the event's files.`,
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
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'reorderMemberEventAssets',
      tags: ['Events'],
      summary: 'Reorder the files of an event you run',
      description: `Requires \`events:write\`. Send every attached file id exactly once (409 otherwise). Returns the event's files.`,
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
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'renameMemberEventAsset',
      tags: ['Events'],
      summary: "Set a file's display name within an event you run",
      description: `Requires \`events:write\`. Null falls back to the filename. Returns the event's files.`,
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
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'removeMemberEventAsset',
      tags: ['Events'],
      summary: 'Remove a file from an event you run',
      description: `Requires \`events:write\`. The library file itself survives. Returns the event's files.`,
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
    url: '/api/member/events/:eventId/registration',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'registerForEvent',
      tags: ['Events'],
      summary: 'Register for an event',
      description:
        'Any active member of the organization registers themselves for a published `public` event that has not started, with source `self`. 403 when the event is `private`; 404 when it does not exist or is not published; 409 `already_registered`, `started` or `full`.',
      params: EventIdParam,
      response: { 204: z.void(), ...refusals(403, 404, 409) },
    },
    handler: async (req, reply) => {
      const actor = await resolveActor(container, req);
      await container.entitlements.grant(
        {
          orgUserId: actor.id,
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
    url: '/api/member/events/:eventId/registration',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'cancelEventRegistration',
      tags: ['Events'],
      summary: 'Cancel your registration for an event',
      description:
        'Any active member of the organization revokes their own direct grant to the event, which frees the place. 404 when the caller has no direct active grant.',
      params: EventIdParam,
      response: { 204: z.void(), ...refusals(403, 404) },
    },
    handler: async (req, reply) => {
      const actor = await resolveActor(container, req);
      await container.entitlements.revoke(
        { orgUserId: actor.id, contentId: req.params.eventId, contentType: 'event' },
        actor,
      );
      return reply.code(204).send();
    },
  });

  r.route({
    method: 'POST',
    url: '/api/member/events/:eventId/attendees',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'addMemberEventAttendee',
      tags: ['Events'],
      summary: 'Add an attendee to an event you run',
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
    url: '/api/member/events/:eventId/attendees/:orgUserId',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'removeMemberEventAttendee',
      tags: ['Events'],
      summary: 'Remove an attendee from an event you run',
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
}
