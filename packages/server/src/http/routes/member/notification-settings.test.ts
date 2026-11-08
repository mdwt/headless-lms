import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { NotFoundError, ValidationError } from '@headless-lms/core/shared/errors';
import { actorWith } from '@headless-lms/core/organizations';
import type { Container } from '../../../app/container.js';
import { registerAuth } from '../../plugins/auth.js';
import { errorHandler } from '../../plugins/error-handler.js';
import { mcpEndpoints } from '../../../app/mcp-endpoints.js';
import { memberNotificationSettingsRoutes } from './notification-settings.js';
import { memberDeviceRoutes } from './devices.js';
import { resolvedCaller } from '../../test-caller.js';

const ORG = { id: 'org_1', name: 'Acme', slug: 'acme', externalId: 'org_1' };
const ORG_USER = { id: 'ou_sarah', orgId: 'org_1', status: 'active', userId: 'usr_1' };
const SARAH = actorWith({ id: 'ou_sarah', orgId: 'org_1' });
const MEMBER = { ...SARAH, userId: 'usr_1' };
const calls: { method: string; args: unknown[] }[] = [];
let failWith: Error | null = null;

const view = {
  communityId: 'cmy_1',
  digest: { cadence: 'weekly', weekday: 1, hour: 8, timeZone: 'Europe/Madrid' },
  categories: [
    {
      key: 'new_posts',
      perSpace: true,
      channels: [
        { channel: 'push', enabled: false, default: false, source: 'default', locked: false },
      ],
      spaces: [
        {
          spaceId: 'spc_1',
          name: 'Practice',
          channels: [
            { channel: 'push', enabled: true, default: false, source: 'space', locked: false },
          ],
        },
      ],
    },
  ],
};

const device = {
  id: 'dev_1',
  provider: 'apns',
  token: 'tok',
  p256dh: null,
  auth: null,
  appId: 'com.app',
  environment: 'production',
};

function record(method: string, result: (...args: unknown[]) => unknown = () => undefined) {
  return async (...args: unknown[]) => {
    calls.push({ method, args });
    if (failWith) {
      throw failWith;
    }
    return result(...args);
  };
}

const container = {
  mcp: mcpEndpoints({
    authBaseURL: 'https://lms.example.com',
    adminAppUrl: 'https://admin.example.com',
  }),
  requestContext: { set: () => {} },
  auth: {
    verify: async () => ({
      user: { id: 'usr_1', email: 'a@b.c' },
      session: { activeOrganizationId: ORG.id },
    }),
  },
  organizations: {
    getByExternalId: async () => ORG,
    getOrgUser: async () => ORG_USER,
    actorFor: async () => SARAH,
    resolveCaller: async () => resolvedCaller(ORG, { id: 'usr_1' }, ORG_USER, SARAH),
  },
  identity: { getUserByExternalId: async () => ({ id: 'usr_1' }) },
  reporting: {
    member: {
      communityNotificationSettings: record('communitySettings', (id) => {
        if (id !== 'cmy_1') {
          throw new NotFoundError('Community', String(id));
        }
        return view;
      }),
      orgNotificationSettings: record('orgSettings', () => ({ categories: [] })),
    },
  },
  notificationSettings: { set: record('set') },
  devices: {
    list: record('list', () => [{ ...device, lastSeenAt: '2026-11-03T12:00:00.000Z' }]),
    register: record('register', () => device),
    remove: record('remove'),
    pushConfig: () => ({ vapidPublicKey: 'BPub' }),
  },
} as unknown as Container;

let app: FastifyInstance;

beforeAll(async () => {
  app = Fastify();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.setErrorHandler(errorHandler);
  registerAuth(app, container);
  await memberNotificationSettingsRoutes(app, container);
  await memberDeviceRoutes(app, container);
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  calls.length = 0;
  failWith = null;
});

function last(method: string) {
  return calls.filter((call) => call.method === method).at(-1)?.args;
}

describe('member notification settings routes', () => {
  it('serves the community settings view, and 404 when the person cannot open it', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/member/communities/cmy_1/settings/notifications',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(view);
    expect(last('communitySettings')).toEqual(['cmy_1', MEMBER]);
    const missing = await app.inject({
      method: 'GET',
      url: '/api/member/communities/cmy_x/settings/notifications',
    });
    expect(missing.statusCode).toBe(404);
  });

  it('passes the changes to identity as the caller and answers 204', async () => {
    const settings = [
      { category: 'mentions', channel: 'email', enabled: false },
      { category: 'new_posts', spaceId: 'spc_1', channel: 'push', enabled: true },
      { category: 'comments_on_my_posts', channel: 'push', enabled: null },
    ];
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/member/communities/cmy_1/settings/notifications',
      payload: { settings },
    });
    expect(res.statusCode).toBe(204);
    expect(last('set')).toEqual([{ communityId: 'cmy_1' }, settings, MEMBER]);
    const org = await app.inject({
      method: 'PATCH',
      url: '/api/member/settings/notifications',
      payload: { settings: [{ category: 'access', channel: 'inApp', enabled: true }] },
    });
    expect(org.statusCode).toBe(204);
    expect(last('set')?.[0]).toBe('org');
  });

  it('answers 422 and 404 from identity, and 400 for a body out of shape', async () => {
    failWith = new ValidationError('settings[0]: there is no category likes');
    const invalid = await app.inject({
      method: 'PATCH',
      url: '/api/member/communities/cmy_1/settings/notifications',
      payload: { settings: [{ category: 'likes', channel: 'email', enabled: true }] },
    });
    expect(invalid.statusCode).toBe(422);
    expect(invalid.json()).toMatchObject({ message: 'settings[0]: there is no category likes' });
    failWith = new NotFoundError('Community', 'cmy_1');
    const missing = await app.inject({
      method: 'PATCH',
      url: '/api/member/communities/cmy_1/settings/notifications',
      payload: { settings: [{ category: 'mentions', channel: 'email', enabled: true }] },
    });
    expect(missing.statusCode).toBe(404);
    failWith = null;
    const shapeless = await app.inject({
      method: 'PATCH',
      url: '/api/member/settings/notifications',
      payload: { settings: [{ category: 'mentions', channel: 'email' }] },
    });
    expect(shapeless.statusCode).toBe(400);
  });

  it('serves the org settings view as the caller', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/member/settings/notifications' });
    expect(res.json()).toEqual({ categories: [] });
    expect(last('orgSettings')).toEqual([MEMBER]);
  });
});

describe('member device routes', () => {
  it('registers a device as the caller and lists their devices', async () => {
    const body = {
      provider: 'apns',
      token: 'tok',
      appId: 'com.app',
      environment: 'production',
    };
    const res = await app.inject({ method: 'POST', url: '/api/member/devices', payload: body });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(device);
    expect(last('register')).toEqual([body, MEMBER]);
    const list = await app.inject({ method: 'GET', url: '/api/member/devices' });
    expect(list.json()).toEqual([{ ...device, lastSeenAt: '2026-11-03T12:00:00.000Z' }]);
  });

  it('answers 422 for a registration identity refuses, and 400 for an unknown provider', async () => {
    failWith = new ValidationError('push through apns is not configured');
    const refused = await app.inject({
      method: 'POST',
      url: '/api/member/devices',
      payload: { provider: 'apns', token: 'tok' },
    });
    expect(refused.statusCode).toBe(422);
    failWith = null;
    const unknown = await app.inject({
      method: 'POST',
      url: '/api/member/devices',
      payload: { provider: 'sms', token: 'tok' },
    });
    expect(unknown.statusCode).toBe(400);
  });

  it('removes a device with 204, 404 when it is not the caller’s', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/api/member/devices/dev_1' });
    expect(res.statusCode).toBe(204);
    expect(last('remove')?.[0]).toBe('dev_1');
    failWith = new NotFoundError('Device', 'dev_2');
    const missing = await app.inject({ method: 'DELETE', url: '/api/member/devices/dev_2' });
    expect(missing.statusCode).toBe(404);
  });

  it('serves the VAPID public key', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/member/push-config' });
    expect(res.json()).toEqual({ vapidPublicKey: 'BPub' });
  });
});
