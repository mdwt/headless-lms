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
        organization: { id: 'org_1', name: "Sarah's Yoga", slug: 'sarahs-yoga', createdAt: NOW },
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
      payload: { name: "Sarah's Yoga", slug: 'sarahs-yoga', keyName: 'Shop' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({
      organization: {
        id: 'org_1',
        name: "Sarah's Yoga",
        slug: 'sarahs-yoga',
        createdAt: NOW.toISOString(),
      },
      apiKey: { ...API_KEY, createdAt: NOW.toISOString() },
    });
    expect(calls).toEqual([
      [
        'createPlatformOrganization',
        { name: "Sarah's Yoga", slug: 'sarahs-yoga', keyName: 'Shop' },
      ],
    ]);
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
        payload: { name: 'x', slug: 'x' },
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
      payload: { name: 'x', slug: 'taken' },
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
      payload: { name: 'x', slug: 'Not A Slug' },
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
