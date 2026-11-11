import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { ConflictError, NotFoundError } from '@headless-lms/core/shared/errors';
import type { Container } from '../../app/container.js';
import { platformKeyCheck } from '../../app/platform.js';
import { errorHandler } from '../plugins/error-handler.js';
import { registerPlatformAuth } from '../plugins/platform.js';
import { platformRoutes } from './platform.js';

const PLATFORM_KEY = 'p'.repeat(40);
const NOW = new Date('2026-01-01T00:00:00.000Z');
const API_KEY = {
  id: 'key_1',
  name: 'Shop',
  start: 'hlms_a',
  role: { key: 'owner', name: 'Owner' },
  createdAt: NOW,
  lastUsedAt: null,
  expiresAt: null,
  key: 'hlms_secret',
};

const HOSTS = {
  courses: 'https://sarahs-yoga.platform.test',
  community: 'https://sarahs-yoga.platform.test',
};

const YOGA = {
  name: "Sarah's Yoga",
  slug: 'sarahs-yoga',
  metadata: { plan: 'pro' },
};

let calls: unknown[][] = [];
let failure: Error | null = null;

const container = {
  organizations: {
    createPlatformOrganization: async (input: unknown) => {
      calls.push(['createPlatformOrganization', input]);
      if (failure) {
        throw failure;
      }
      return {
        organization: {
          id: 'org_1',
          name: "Sarah's Yoga",
          slug: 'sarahs-yoga',
          metadata: { plan: 'pro' },
          createdAt: NOW,
          hosts: HOSTS,
        },
        apiKey: API_KEY,
      };
    },
    createPlatformApiKey: async (orgId: string, name: string) => {
      calls.push(['createPlatformApiKey', orgId, name]);
      if (failure) {
        throw failure;
      }
      return { ...API_KEY, name };
    },
    getPlatformOrganization: async (slug: string) => {
      calls.push(['getPlatformOrganization', slug]);
      if (failure) {
        throw failure;
      }
      return {
        id: 'org_1',
        name: "Sarah's Yoga",
        slug: 'sarahs-yoga',
        metadata: { plan: 'pro' },
        createdAt: NOW,
        hosts: HOSTS,
      };
    },
  },
} as unknown as Container;

let app: FastifyInstance;

beforeAll(async () => {
  app = Fastify();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.setErrorHandler(errorHandler);
  registerPlatformAuth(
    app,
    platformKeyCheck({ key: PLATFORM_KEY, accountEmail: 'platform@example.test' }),
  );
  await platformRoutes(app, container);
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  calls = [];
  failure = null;
});

const auth = { authorization: `Bearer ${PLATFORM_KEY}` };

describe('platform routes', () => {
  it('creates an organization and returns it with its API key', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/platform/organizations',
      headers: auth,
      payload: YOGA,
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({
      organization: {
        id: 'org_1',
        name: "Sarah's Yoga",
        slug: 'sarahs-yoga',
        metadata: { plan: 'pro' },
        createdAt: NOW.toISOString(),
        hosts: HOSTS,
      },
      apiKey: { ...API_KEY, createdAt: NOW.toISOString() },
    });
    expect(calls).toEqual([['createPlatformOrganization', YOGA]]);
  });

  it('refuses metadata beyond its limits', async () => {
    for (const payload of [
      { ...YOGA, metadata: { plan: 1 } },
      { ...YOGA, metadata: { ['k'.repeat(41)]: 'v' } },
      { ...YOGA, metadata: { plan: 'v'.repeat(501) } },
      {
        ...YOGA,
        metadata: Object.fromEntries(Array.from({ length: 51 }, (_, i) => [`k${i}`, 'v'])),
      },
    ]) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/platform/organizations',
        headers: auth,
        payload,
      });
      expect(res.statusCode).toBe(400);
    }
    expect(calls).toEqual([]);
  });

  it('creates another key for an organization', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/platform/organizations/org_1/api-keys',
      headers: auth,
      payload: { name: 'Rotated' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ name: 'Rotated', key: 'hlms_secret' });
    expect(calls).toEqual([['createPlatformApiKey', 'org_1', 'Rotated']]);
  });

  it('finds an organization by its slug', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/platform/organizations?slug=sarahs-yoga',
      headers: auth,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      id: 'org_1',
      name: "Sarah's Yoga",
      slug: 'sarahs-yoga',
      metadata: { plan: 'pro' },
      createdAt: NOW.toISOString(),
      hosts: HOSTS,
    });
    expect(calls).toEqual([['getPlatformOrganization', 'sarahs-yoga']]);
  });

  it('refuses a lookup without a slug or without the platform key, and maps an unknown slug to 404', async () => {
    const noSlug = await app.inject({
      method: 'GET',
      url: '/api/platform/organizations',
      headers: auth,
    });
    expect(noSlug.statusCode).toBe(400);
    const noKey = await app.inject({
      method: 'GET',
      url: '/api/platform/organizations?slug=sarahs-yoga',
    });
    expect(noKey.statusCode).toBe(401);
    expect(calls).toEqual([]);
    failure = new NotFoundError('Organization', 'gone');
    const missing = await app.inject({
      method: 'GET',
      url: '/api/platform/organizations?slug=gone',
      headers: auth,
    });
    expect(missing.statusCode).toBe(404);
  });

  it('refuses a missing or wrong platform key, and an API key, before doing anything', async () => {
    for (const headers of [
      {},
      { authorization: `Bearer ${'x'.repeat(40)}` },
      { authorization: PLATFORM_KEY },
      { 'x-api-key': PLATFORM_KEY },
      { authorization: 'Bearer hlms_secret' },
    ]) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/platform/organizations',
        headers,
        payload: YOGA,
      });
      expect(res.statusCode).toBe(401);
    }
    expect(calls).toEqual([]);
  });

  it('maps a taken slug to 409, an unknown org to 404 and a bad slug to 400', async () => {
    failure = new ConflictError('That slug is already in use');
    const taken = await app.inject({
      method: 'POST',
      url: '/api/platform/organizations',
      headers: auth,
      payload: { ...YOGA, slug: 'taken' },
    });
    expect(taken.statusCode).toBe(409);
    failure = new NotFoundError('Organization', 'org_9');
    const missing = await app.inject({
      method: 'POST',
      url: '/api/platform/organizations/org_9/api-keys',
      headers: auth,
      payload: { name: 'x' },
    });
    expect(missing.statusCode).toBe(404);
    const bad = await app.inject({
      method: 'POST',
      url: '/api/platform/organizations',
      headers: auth,
      payload: { ...YOGA, slug: 'Not A Slug' },
    });
    expect(bad.statusCode).toBe(400);
  });
});

describe('platformKeyCheck', () => {
  it('refuses a short key or an account without an email', () => {
    expect(() => platformKeyCheck({ key: 'short', accountEmail: 'a@b.c' })).toThrow();
    expect(() => platformKeyCheck({ key: PLATFORM_KEY, accountEmail: 'nobody' })).toThrow();
  });
});
