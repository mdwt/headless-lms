import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { NotFoundError } from '@headless-lms/core/shared/errors';
import type { NewApiKey } from '@headless-lms/core/types';
import type { Container } from '../../app/container.js';
import { mcpEndpoints } from '../../app/mcp-endpoints.js';
import { registerAuth } from '../plugins/auth.js';
import { errorHandler } from '../plugins/error-handler.js';
import { accessRoutes } from './access.js';

const ORG = { id: 'org_dom', name: 'Acme', slug: 'acme', externalId: 'org_auth' };
const SESSION = {
  user: { id: 'usr_1', email: 'a@b.c' },
  session: { activeOrganizationId: ORG.externalId },
};
const H = { 'x-test': '1' };
const NOW = new Date('2026-01-01T00:00:00.000Z');

let calls: Array<[string, ...unknown[]]> = [];
let deleteError: Error | null = null;
let session: typeof SESSION | null = SESSION;
let role = 'owner';

const container = {
  mcp: mcpEndpoints({
    authBaseURL: 'http://localhost:8100',
    adminAppUrl: 'http://localhost:8101',
  }),
  auth: {
    verify: async () => session,
    handler: async () => new Response(null),
    listConnectedApps: async (h: Record<string, unknown>, orgId: string) => {
      calls.push(['listConnectedApps', h['x-test'], orgId]);
      return [
        {
          clientId: 'client_1',
          name: 'Claude',
          iconUrl: null,
          scopes: ['courses:read'],
          connectedAt: NOW,
        },
      ];
    },
    revokeConnectedApp: async (h: Record<string, unknown>, orgId: string, clientId: string) => {
      calls.push(['revokeConnectedApp', h['x-test'], orgId, clientId]);
    },
    listApiKeys: async (h: Record<string, unknown>, orgId: string) => {
      calls.push(['listApiKeys', h['x-test'], orgId]);
      return [
        {
          id: 'key_1',
          name: 'CI',
          start: 'abc',
          scopes: ['courses:read'],
          createdAt: NOW,
          lastUsedAt: null,
        },
      ];
    },
    createApiKey: async (input: NewApiKey) => {
      calls.push(['createApiKey', input]);
      return {
        id: 'key_1',
        name: input.name,
        start: 'abc',
        scopes: input.scopes,
        createdAt: NOW,
        lastUsedAt: null,
        key: 'secret',
      };
    },
    deleteApiKey: async (h: Record<string, unknown>, orgId: string, keyId: string) => {
      calls.push(['deleteApiKey', h['x-test'], orgId, keyId]);
      if (deleteError) {
        throw deleteError;
      }
    },
  },
  organizations: {
    getById: async (id: string) => (id === ORG.id ? ORG : null),
    getByExternalId: async (externalId: string) => (externalId === ORG.externalId ? ORG : null),
    getOrgUser: async () => ({ id: 'ou_1', role }),
  },
  identity: { getUserByExternalId: async () => ({ id: 'dom_usr_1' }) },
  requestContext: { set: () => {} },
} as unknown as Container;

let app: FastifyInstance;

beforeAll(async () => {
  app = Fastify();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.setErrorHandler(errorHandler);
  registerAuth(app, container);
  await app.register(async (instance) => {
    await accessRoutes(instance, container);
  });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  calls = [];
  deleteError = null;
  session = SESSION;
  role = 'owner';
});

describe('access routes', () => {
  it('lists every scope with whether your role can grant it', async () => {
    role = 'instructor';
    const res = await app.inject({ method: 'GET', url: '/api/access/scopes', headers: H });
    expect(res.statusCode).toBe(200);
    const options: Array<{ scope: string; allowed: boolean }> = res.json();
    expect(options).toHaveLength(27);
    expect(options.filter((option) => option.allowed).map((option) => option.scope)).toEqual([
      'courses:read',
      'downloads:read',
      'bundles:read',
      'media:read',
      'automations:read',
      'comments:read',
      'communities:read',
      'community_members:read',
      'community_members:write',
      'community_moderation:read',
      'community_moderation:write',
    ]);
  });

  it('lists connected apps for the session org', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/access/apps', headers: H });
    expect(res.statusCode).toBe(200);
    expect(res.json()[0].clientId).toBe('client_1');
    expect(calls).toEqual([['listConnectedApps', '1', 'org_auth']]);
  });

  it('revokes a connected app', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/access/apps/client_1',
      headers: H,
    });
    expect(res.statusCode).toBe(204);
    expect(calls).toEqual([['revokeConnectedApp', '1', 'org_auth', 'client_1']]);
  });

  it('lists api keys with their scopes', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/access/api-keys', headers: H });
    expect(res.statusCode).toBe(200);
    expect(res.json()[0].scopes).toEqual(['courses:read']);
    expect(calls).toEqual([['listApiKeys', '1', 'org_auth']]);
  });

  it('creates an api key with the requested scopes and returns the secret', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/access/api-keys',
      headers: H,
      payload: { name: 'CI', scopes: ['courses:read', 'courses:write'] },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ key: 'secret', scopes: ['courses:read', 'courses:write'] });
    expect(calls).toEqual([
      [
        'createApiKey',
        {
          authUserId: 'usr_1',
          orgId: 'org_auth',
          name: 'CI',
          scopes: ['courses:read', 'courses:write'],
        },
      ],
    ]);
  });

  it('refuses a scope your role cannot grant', async () => {
    role = 'instructor';
    const res = await app.inject({
      method: 'POST',
      url: '/api/access/api-keys',
      headers: H,
      payload: { name: 'CI', scopes: ['courses:read', 'courses:write'] },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({
      error: 'forbidden',
      message: 'Your role cannot grant courses:write',
    });
    expect(calls).toEqual([]);
  });

  it('rejects an empty name, an empty scope list and an unknown scope', async () => {
    for (const payload of [
      { name: '', scopes: ['courses:read'] },
      { name: 'CI', scopes: [] },
      { name: 'CI', scopes: ['lms:read'] },
    ]) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/access/api-keys',
        headers: H,
        payload,
      });
      expect(res.statusCode).toBe(400);
    }
    expect(calls).toEqual([]);
  });

  it('deletes an api key', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/access/api-keys/key_1',
      headers: H,
    });
    expect(res.statusCode).toBe(204);
    expect(calls).toEqual([['deleteApiKey', '1', 'org_auth', 'key_1']]);
  });

  it("answers 404 when the key is not the caller's", async () => {
    deleteError = new NotFoundError('API key', 'key_9');
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/access/api-keys/key_9',
      headers: H,
    });
    expect(res.statusCode).toBe(404);
  });

  it('requires a session', async () => {
    session = null;
    const res = await app.inject({ method: 'GET', url: '/api/access/apps', headers: H });
    expect(res.statusCode).toBe(401);
    expect(calls).toEqual([]);
  });
});
