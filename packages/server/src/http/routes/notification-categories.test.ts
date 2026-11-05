import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import {
  DEFAULT_COMMUNITY_CATEGORIES,
  DEFAULT_ORG_CATEGORIES,
  NOTIFICATION_TYPES,
} from '@headless-lms/core/automations';
import { CommunityNotificationCategories } from '@headless-lms/core/content';
import {
  actorWith,
  NotificationCatalog,
  OrgNotificationCategories,
} from '@headless-lms/core/organizations';
import type { Actor } from '@headless-lms/core/shared/actor';
import { SettingsService, type SettingsRepository } from '@headless-lms/core/shared/settings';
import type { Container } from '../../app/container.js';
import { buildNotificationRegistries } from '../../app/notification-channels.js';
import { registerAuth } from '../plugins/auth.js';
import { errorHandler } from '../plugins/error-handler.js';
import { mcpEndpoints } from '../../app/mcp-endpoints.js';
import { communitiesRoutes } from './communities.js';
import { organizationsRoutes } from './organizations.js';

const ORG = { id: 'org_1', name: 'Acme', slug: 'acme', externalId: 'org_1' };
const orgUser = { id: 'ou_staff', orgId: ORG.id, status: 'active' };
const ADMIN = actorWith({
  id: orgUser.id,
  orgId: ORG.id,
  org: ['notification_categories:read', 'notification_categories:write', 'communities:write'],
});
let actor: Actor = ADMIN;
const rows = new Map<string, Record<string, unknown>>();

const settingsRepo: SettingsRepository = {
  find: async (orgId, scopeId, namespace) => {
    const value = rows.get(`${orgId}:${namespace}:${scopeId}`);
    return value ? [{ namespace: namespace ?? '', scopeId, value }] : [];
  },
  patch: async (orgId, namespace, scopeId, patch) => {
    const key = `${orgId}:${namespace}:${scopeId}`;
    const value = { ...(rows.get(key) ?? {}), ...(patch as Record<string, unknown>) };
    rows.set(key, value);
    return { namespace, scopeId, value };
  },
};
const registries = buildNotificationRegistries({
  declarations: NOTIFICATION_TYPES,
  defaults: { community: DEFAULT_COMMUNITY_CATEGORIES, org: DEFAULT_ORG_CATEGORIES },
  mailer: { send: async () => {} },
  emailOf: async () => null,
  push: null,
  channels: [],
});
const settings = new SettingsService(settingsRepo);

const container = {
  mcp: mcpEndpoints({
    authBaseURL: 'https://lms.example.com',
    adminAppUrl: 'https://admin.example.com',
  }),
  auth: {
    verify: async () => ({
      user: { id: 'usr_1', email: 'a@b.c' },
      session: { activeOrganizationId: ORG.id },
    }),
  },
  organizations: {
    getByExternalId: async () => ORG,
    getById: async () => ORG,
    getOrgUser: async () => orgUser,
    actorFor: async () => actor,
  },
  identity: { getUserByExternalId: async () => ({ id: 'usr_1' }) },
  requestContext: { set: () => {} },
  content: {},
  notificationTypes: registries.types,
  notificationChannels: registries.channels,
  notificationCatalog: new NotificationCatalog({
    types: registries.types,
    channels: registries.channels,
  }),
  notificationCategories: {
    community: new CommunityNotificationCategories({
      communities: {
        findCommunityById: async (_orgId: string, id: string) =>
          id === 'cmy_1' ? ({ id } as never) : null,
      },
      settings,
      types: registries.types,
      channels: registries.channels,
    }),
    org: new OrgNotificationCategories({
      settings,
      types: registries.types,
      channels: registries.channels,
    }),
  },
} as unknown as Container;

let app: FastifyInstance;

beforeAll(async () => {
  app = Fastify();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.setErrorHandler(errorHandler);
  registerAuth(app, container);
  await organizationsRoutes(app, container);
  await app.register(async (instance) => {
    instance.addHook('onRequest', instance.requireOrgSession);
    await communitiesRoutes(instance, container);
  });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  rows.clear();
  actor = ADMIN;
});

const mentions = {
  key: 'mentions',
  covers: [{ type: 'mention', reasons: ['mentioned'] }],
  channels: { inApp: { default: true, locked: false }, email: { default: false, locked: false } },
};

describe('notification discovery routes', () => {
  it('lists the types a list of the scope can cover, with all their scopes', async () => {
    const org = await app.inject({ method: 'GET', url: '/api/notification-types?scope=org' });
    expect(org.statusCode).toBe(200);
    const types = org.json() as { type: string; scopes: string[] }[];
    expect(types.map((t) => t.type)).toContain('access.granted');
    expect(types.map((t) => t.type)).not.toContain('message.sent');
    expect(types.find((t) => t.type === 'comment.created')?.scopes).toEqual(['space', 'org']);
    const community = await app.inject({
      method: 'GET',
      url: '/api/notification-types?scope=community',
    });
    expect((community.json() as { type: string }[]).map((t) => t.type)).toContain('digest');
  });

  it('lists the configured channels, in-app first', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/notification-channels' });
    expect(res.json()).toEqual([{ channel: 'inApp' }, { channel: 'email' }]);
  });

  it('refuses an instructor, who holds course permissions only', async () => {
    actor = actorWith({
      id: orgUser.id,
      orgId: ORG.id,
      org: ['courses:read', 'courses:write', 'courses:moderate', 'progress:read'],
    });
    for (const url of [
      '/api/notification-types?scope=org',
      '/api/notification-channels',
      '/api/notification-categories',
      '/api/notification-categories/defaults?scope=org',
      '/api/communities/cmy_1/notification-categories',
    ]) {
      expect((await app.inject({ method: 'GET', url })).statusCode).toBe(403);
    }
  });
});

describe('a community editor', () => {
  it('loads the community types, channels and defaults, and edits only their community', async () => {
    actor = actorWith({ id: orgUser.id, orgId: ORG.id, content: { cmy_1: ['communities:write'] } });
    for (const url of [
      '/api/notification-types?scope=community',
      '/api/notification-channels',
      '/api/notification-categories/defaults?scope=community',
      '/api/communities/cmy_1/notification-categories',
    ]) {
      expect((await app.inject({ method: 'GET', url })).statusCode).toBe(200);
    }
    for (const url of [
      '/api/notification-types?scope=org',
      '/api/notification-categories',
      '/api/notification-categories/defaults?scope=org',
      '/api/communities/cmy_2/notification-categories',
    ]) {
      expect((await app.inject({ method: 'GET', url })).statusCode).toBe(403);
    }
  });
});

describe('org notification category routes', () => {
  it('serves the default, stores a whole list, and resets to the default', async () => {
    const first = await app.inject({ method: 'GET', url: '/api/notification-categories' });
    expect(first.json()).toMatchObject({ source: 'default' });
    expect(
      (first.json() as { categories: { key: string }[] }).categories.map((c) => c.key),
    ).toContain('followed_threads');
    const put = await app.inject({
      method: 'PUT',
      url: '/api/notification-categories',
      payload: { categories: [mentions] },
    });
    expect(put.statusCode).toBe(200);
    expect(put.json()).toEqual({ categories: [mentions], source: 'stored' });
    expect(rows.get('org_1:organizations:org_1')).toEqual({ notificationCategories: [mentions] });
    const del = await app.inject({ method: 'DELETE', url: '/api/notification-categories' });
    expect(del.statusCode).toBe(204);
    expect(rows.get('org_1:organizations:org_1')).toEqual({ notificationCategories: null });
    const after = await app.inject({ method: 'GET', url: '/api/notification-categories' });
    expect(after.json()).toMatchObject({ source: 'default' });
  });

  it('answers 422 with every problem for a list that fails validation', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/notification-categories',
      payload: {
        categories: [
          { ...mentions, channels: { push: { default: true, locked: false } } },
          {
            ...mentions,
            key: 'chat',
            covers: [{ type: 'message.sent', reasons: ['participant'] }],
          },
        ],
      },
    });
    expect(res.statusCode).toBe(422);
    const body = res.json() as { error: string; issues: { path: string; message: string }[] };
    expect(body.error).toBe('unprocessable');
    expect(body.issues).toEqual([
      { path: 'body.categories[0].channels.push', message: 'the channel push is not configured' },
      {
        path: 'body.categories[1].covers[0].type',
        message: 'message.sent cannot be in the org list',
      },
    ]);
  });

  it('answers 400 for a list that is not in the category shape', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/notification-categories',
      payload: { categories: [{ ...mentions, key: 'Not a key' }] },
    });
    expect(res.statusCode).toBe(400);
  });

  it('serves the default list of either scope', async () => {
    const org = await app.inject({
      method: 'GET',
      url: '/api/notification-categories/defaults?scope=org',
    });
    expect((org.json() as { categories: { key: string }[] }).categories[0]?.key).toBe('about_you');
    const community = await app.inject({
      method: 'GET',
      url: '/api/notification-categories/defaults?scope=community',
    });
    expect(
      (community.json() as { categories: { key: string }[] }).categories.map((c) => c.key),
    ).toContain('new_posts');
  });
});

describe('community notification category routes', () => {
  it('serves, stores and resets one community list', async () => {
    const url = '/api/communities/cmy_1/notification-categories';
    expect((await app.inject({ method: 'GET', url })).json()).toMatchObject({ source: 'default' });
    const put = await app.inject({ method: 'PUT', url, payload: { categories: [mentions] } });
    expect(put.json()).toEqual({ categories: [mentions], source: 'stored' });
    expect(rows.get('org_1:content:cmy_1')).toEqual({ notificationCategories: [mentions] });
    expect((await app.inject({ method: 'DELETE', url })).statusCode).toBe(204);
    expect((await app.inject({ method: 'GET', url })).json()).toMatchObject({ source: 'default' });
  });

  it('answers 404 for a community the org does not have', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/communities/cmy_x/notification-categories',
    });
    expect(res.statusCode).toBe(404);
  });
});
