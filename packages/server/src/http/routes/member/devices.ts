import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Container } from '../../../app/container.js';
import type { FastifyRequest } from 'fastify';
import { resolveActor, resolveCaller } from '../../scope.js';
import {
  Device,
  DeviceIdParam,
  DeviceList,
  PushConfigView,
  RegisterDevice,
  refusals,
} from '../../schemas/index.js';

export async function memberDeviceRoutes(
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
    url: '/api/member/devices',
    config: { operation: 'devices.list' },
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'listMemberDevices',
      tags,
      summary: 'List the devices you registered for push notifications',
      description:
        'For anyone signed in to the organization. Each app install or browser that registered, most recently seen first. A device not seen for 30 days receives no push until it registers again.',
      response: { 200: DeviceList, ...refusals(403) },
    },
    handler: async (req) => {
      return container.devices.list(await memberOf(req));
    },
  });

  r.route({
    method: 'POST',
    url: '/api/member/devices',
    config: { operation: 'devices.register' },
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'registerMemberDevice',
      tags,
      summary: 'Register this device for push notifications, or refresh it',
      description:
        'For anyone signed in to the organization. Call it after sign-in and on every launch. A new token adds a device, a known token is refreshed, and a token another person registered moves to you. A browser sends its push subscription endpoint as `token` with its `keys`; an iOS app sends its bundle id as `appId` and its APNs `environment`. 422 when the provider is not configured, an `apns` `appId` is not one of the configured bundle ids, a `webpush` device has no `keys`, or `keys` or `environment` come with a provider they do not apply to.',
      body: RegisterDevice,
      response: { 200: Device, ...refusals(400, 403, 422) },
    },
    handler: async (req) => {
      return container.devices.register(req.body, await memberOf(req));
    },
  });

  r.route({
    method: 'DELETE',
    url: '/api/member/devices/:deviceId',
    config: { operation: 'devices.remove' },
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'removeMemberDevice',
      tags,
      summary: 'Remove one of your devices',
      description:
        'For the person who registered the device. Call it before signing out, so the next person on the device receives none of your pushes. 404 when the device is not yours.',
      params: DeviceIdParam,
      response: { 204: z.void(), ...refusals(403, 404) },
    },
    handler: async (req, reply) => {
      await container.devices.remove(req.params.deviceId, await memberOf(req));
      return reply.code(204).send();
    },
  });

  r.route({
    method: 'GET',
    url: '/api/member/push-config',
    config: { operation: 'devices.pushConfig' },
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'getMemberPushConfig',
      tags,
      summary: 'Read what a browser needs to subscribe to push notifications',
      description:
        'For anyone signed in to the organization. `vapidPublicKey` is the `applicationServerKey` for `pushManager.subscribe`, or null when Web Push is not configured.',
      response: { 200: PushConfigView, ...refusals(403) },
    },
    handler: async (req) => {
      await resolveActor(container, req);
      return container.devices.pushConfig();
    },
  });
}
