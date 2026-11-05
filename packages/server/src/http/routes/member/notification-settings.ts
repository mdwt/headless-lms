import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Container } from '../../../app/container.js';
import { NotFoundError } from '@headless-lms/core/shared/errors';
import { resolveCaller } from '../../scope.js';
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

  async function memberOf(req: FastifyRequest) {
    const caller = await resolveCaller(container, req);
    return { ...caller.actor, userId: caller.userId };
  }

  r.route({
    method: 'GET',
    url: '/api/member/communities/:communityId/settings/notifications',
    config: { operation: 'reporting.member.communityNotificationSettings' },
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'getMemberCommunityNotificationSettings',
      tags,
      summary: 'Read how you are told about each notification category in a community',
      description:
        'For anyone who can open the community. One entry per category of the list in use that can apply to you, each with the channels it offers on this deployment, whether each is on for you and why (`locked`, `space`, `community`, `spaceDefault` or `default`), and `default`, what the channel would be without your own setting at that level. A per-space category also lists every space you can open, with its name. `digest` is the digest schedule of the community, null when it sends none. 404 when you cannot open the community.',
      params: CommunityParam,
      response: { 200: CommunityNotificationSettings, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const caller = await resolveCaller(container, req);
      const view = await container.reporting.member.communityNotificationSettings(
        caller.userId,
        req.params.communityId,
        caller.actor,
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
    config: { operation: 'notificationSettings.set' },
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'setMemberCommunityNotificationSettings',
      tags,
      summary: 'Switch notification categories on or off per channel in a community',
      description:
        'For anyone who can open the community. Each setting switches one category on one channel, for all spaces or, for a per-space category, for one space; `enabled: null` removes your choice so the default applies again. Settings left out keep their values. 404 when you cannot open the community; 422 when a category does not exist, does not offer the channel, the channel is locked, or `spaceId` is given for a category that is not per space.',
      params: CommunityParam,
      body: PatchNotificationSettings,
      response: { 204: z.void(), ...refusals(400, 403, 404, 422) },
    },
    handler: async (req, reply) => {
      await container.notificationSettings.set(
        { communityId: req.params.communityId },
        req.body.settings,
        await memberOf(req),
      );
      return reply.code(204).send();
    },
  });

  r.route({
    method: 'GET',
    url: '/api/member/settings/notifications',
    config: { operation: 'reporting.member.orgNotificationSettings' },
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'getMemberNotificationSettings',
      tags,
      summary: 'Read how you are told about notifications outside any community',
      description:
        "For anyone signed in to the organization. The organization's categories that can apply to you, such as access and course content, each with the channels it offers, whether each is on for you, and `default`, what it would be without your own setting.",
      response: { 200: OrgNotificationSettings, ...refusals(403) },
    },
    handler: async (req) => {
      const caller = await resolveCaller(container, req);
      return container.reporting.member.orgNotificationSettings(caller.userId, caller.actor);
    },
  });

  r.route({
    method: 'PATCH',
    url: '/api/member/settings/notifications',
    config: { operation: 'notificationSettings.set' },
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
      await container.notificationSettings.set('org', req.body.settings, await memberOf(req));
      return reply.code(204).send();
    },
  });
}
