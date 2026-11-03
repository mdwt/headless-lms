import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Container } from '../../../app/container.js';
import { NotFoundError } from '@headless-lms/core/shared/errors';
import { actorOf } from './actor.js';
import {
  CommunityParam,
  CommunityNotificationSettings,
  OrgNotificationSettings,
  PatchNotificationSettings,
  refusals,
} from '../../schemas/index.js';

export async function memberNotificationSettingsRoutes(
  app: FastifyInstance,
  container: Container,
): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const tags = ['Notifications'];

  r.route({
    method: 'GET',
    url: '/api/member/communities/:communityId/settings/notifications',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'getMemberCommunityNotificationSettings',
      tags,
      summary: 'Read how you are told about each notification category in a community',
      description:
        'For anyone who can open the community, staff included. One entry per category of the list in use, each with the channels it offers on this deployment, whether each is on for you and why (`locked`, `space`, `community`, `spaceDefault` or `default`). A per-space category also lists every space you can open. 404 when you cannot open the community.',
      params: CommunityParam,
      response: { 200: CommunityNotificationSettings, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const actor = await actorOf(container, req.orgId, req.userId);
      const view = await container.reporting.member.communityNotificationSettings(
        req.orgId,
        actor,
        req.userId,
        req.params.communityId,
      );
      if (!view) {
        throw new NotFoundError('Community', req.params.communityId);
      }
      return view;
    },
  });

  r.route({
    method: 'PATCH',
    url: '/api/member/communities/:communityId/settings/notifications',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'setMemberCommunityNotificationSettings',
      tags,
      summary: 'Switch notification categories on or off per channel in a community',
      description:
        'For anyone who can open the community, staff included. Each setting switches one category on one channel, for all spaces or, for a per-space category, for one space; `enabled: null` removes your choice so the default applies again. Settings left out keep their values. 404 when you cannot open the community; 422 when a category does not exist, does not offer the channel, the channel is locked, or `spaceId` is given for a category that is not per space.',
      params: CommunityParam,
      body: PatchNotificationSettings,
      response: { 204: z.void(), ...refusals(400, 403, 404, 422) },
    },
    handler: async (req, reply) => {
      const actor = await actorOf(container, req.orgId, req.userId);
      await container.notificationSettings.set(
        req.orgId,
        { id: actor.id, role: actor.role, userId: req.userId },
        { communityId: req.params.communityId },
        req.body.settings,
      );
      return reply.code(204).send();
    },
  });

  r.route({
    method: 'GET',
    url: '/api/member/settings/notifications',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'getMemberNotificationSettings',
      tags,
      summary: 'Read how you are told about notifications outside any community',
      description:
        "For anyone signed in to the organization. The organization's categories, such as access and course content, each with the channels it offers and whether each is on for you.",
      response: { 200: OrgNotificationSettings, ...refusals(403) },
    },
    handler: async (req) => {
      await actorOf(container, req.orgId, req.userId);
      return container.reporting.member.orgNotificationSettings(req.orgId, req.userId);
    },
  });

  r.route({
    method: 'PATCH',
    url: '/api/member/settings/notifications',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'setMemberNotificationSettings',
      tags,
      summary: 'Switch notification categories outside any community on or off per channel',
      description:
        "For anyone signed in to the organization. Works like the community settings, against the organization's categories; `enabled: null` removes your choice. 422 when a category does not exist, does not offer the channel, the channel is locked, or `spaceId` is given.",
      body: PatchNotificationSettings,
      response: { 204: z.void(), ...refusals(400, 403, 422) },
    },
    handler: async (req, reply) => {
      const actor = await actorOf(container, req.orgId, req.userId);
      await container.notificationSettings.set(
        req.orgId,
        { id: actor.id, role: actor.role, userId: req.userId },
        'org',
        req.body.settings,
      );
      return reply.code(204).send();
    },
  });
}
