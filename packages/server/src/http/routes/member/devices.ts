import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Container } from '../../../app/container.js';
import { actorOf } from './actor.js';
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

  async function memberOf(orgId: string, userId: string) {
    const orgUser = await actorOf(container, orgId, userId);
    return { id: orgUser.id, role: orgUser.role, userId };
  }

  r.route({
    method: 'GET',
    url: '/api/member/devices',
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
      return container.devices.list(req.orgId, await memberOf(req.orgId, req.userId));
    },
  });

  r.route({
    method: 'POST',
    url: '/api/member/devices',
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
      return container.devices.register(req.orgId, await memberOf(req.orgId, req.userId), req.body);
    },
  });

  r.route({
    method: 'DELETE',
    url: '/api/member/devices/:deviceId',
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
      await container.devices.remove(
        req.orgId,
        await memberOf(req.orgId, req.userId),
        req.params.deviceId,
      );
      return reply.code(204).send();
    },
  });

  r.route({
    method: 'GET',
    url: '/api/member/push-config',
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
      await actorOf(container, req.orgId, req.userId);
      return container.devices.pushConfig();
    },
  });
}
