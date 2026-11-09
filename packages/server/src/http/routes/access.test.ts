import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { ForbiddenError, NotFoundError } from '@headless-lms/core/shared/errors';
import { actorWith, permissionList } from '@headless-lms/core/organizations';
import type { Actor } from '@headless-lms/core/shared/actor';
import type { Container } from '../../app/container.js';
import { mcpEndpoints } from '../../app/mcp-endpoints.js';
import { registerAuth } from '../plugins/auth.js';
import { errorHandler } from '../plugins/error-handler.js';
import { accessRoutes } from './access.js';
import { resolvedCaller } from '../test-caller.js';

const ORG = { id: 'org_dom', name: 'Acme', slug: 'acme', externalId: 'org_auth' };
const SESSION = {
  user: { id: 'usr_1', email: 'a@b.c' },
  session: { activeOrganizationId: ORG.externalId },
};
const NOW = new Date('2026-01-01T00:00:00.000Z');
const KEY = {
  id: 'key_1',
  name: 'CI',
  start: 'hlms_a',
  role: { key: 'instructor', name: 'Instructor' },
  createdAt: NOW,
  lastUsedAt: null,
  expiresAt: null,
};

let calls: Array<[string, ...unknown[]]> = [];
let failure: Error | null = null;
let session: typeof SESSION | null = SESSION;
let actor: Actor | null = null;

function record<T>(name: string, result: T) {
  return async (...args: unknown[]) => {
    calls.push([name, ...args]);
    if (failure) {
      throw failure;
    }
    return result;
  };
}

const container = {
  mcp: mcpEndpoints({
    authBaseURL: 'http://localhost:8100',
    adminAppUrl: 'http://localhost:8101',
  }),
  auth: {
    verify: async () => session,
    handler: async () => new Response(null),
  },
  organizations: {
    getById: async (id: string) => (id === ORG.id ? ORG : null),
    getByExternalId: async (externalId: string) => (externalId === ORG.externalId ? ORG : null),
    getOrgUser: async () => ({ id: 'ou_1', status: 'active' }),
    actorFor: async () => actor,
    resolveCaller: async () =>
      resolvedCaller(ORG, { id: 'dom_usr_1' }, { id: 'ou_1', status: 'active' }, actor),
    permissionList: () => permissionList(),
    viewerPermissions: (a: Actor) => ({
      orgRole: { key: 'instructor', name: 'Instructor' },
      isOwner: a.permissions.isOwner(),
      org: ['courses:read'],
      content: {},
    }),
    listConnectedApps: record('listConnectedApps', [
      {
        clientId: 'client_1',
        name: 'Claude',
        iconUrl: null,
        scopes: ['courses:read'],
        connectedAt: NOW,
      },
    ]),
    revokeConnectedApp: record('revokeConnectedApp', undefined),
    listApiKeys: record('listApiKeys', [KEY]),
    listApiKeyRoles: record('listApiKeyRoles', [
      { key: 'instructor', name: 'Instructor', description: 'Teaches courses' },
    ]),
    createApiKey: record('createApiKey', { ...KEY, key: 'secret' }),
    deleteApiKey: record('deleteApiKey', undefined),
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
  failure = null;
  session = SESSION;
  actor = actorWith({
    id: 'ou_1',
    orgId: ORG.id,
    org: ['api_keys:read', 'api_keys:write', 'api_keys:delete'],
  });
});

describe('access routes', () => {
  it('serves the permission list to any active member', async () => {
    actor = actorWith({ id: 'ou_1', orgId: ORG.id });
    const res = await app.inject({ method: 'GET', url: '/api/access/permissions/list' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(permissionList().length);
  });

  it("serves the caller's effective permissions", async () => {
    const res = await app.inject({ method: 'GET', url: '/api/access/permissions' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      orgRole: { key: 'instructor', name: 'Instructor' },
      isOwner: false,
      org: ['courses:read'],
      content: {},
    });
  });

  it('refuses a person who has not accepted their invitation', async () => {
    actor = null;
    const res = await app.inject({ method: 'GET', url: '/api/access/permissions' });
    expect(res.statusCode).toBe(403);
  });

  it('passes the actor to the connected-app methods', async () => {
    const listed = await app.inject({ method: 'GET', url: '/api/access/apps' });
    expect(listed.statusCode).toBe(200);
    const revoked = await app.inject({ method: 'DELETE', url: '/api/access/apps/client_1' });
    expect(revoked.statusCode).toBe(204);
    expect(calls).toEqual([
      ['listConnectedApps', actor],
      ['revokeConnectedApp', 'client_1', actor],
    ]);
  });

  it('lists, creates and revokes api keys through organizations', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/access/api-keys' })).statusCode).toBe(200);
    const roles = await app.inject({ method: 'GET', url: '/api/access/api-keys/roles' });
    expect(roles.json()).toEqual([
      { key: 'instructor', name: 'Instructor', description: 'Teaches courses' },
    ]);
    const created = await app.inject({
      method: 'POST',
      url: '/api/access/api-keys',
      payload: { name: 'CI', role: 'instructor', expiresInDays: 90 },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ role: { key: 'instructor' }, expiresAt: null });
    expect(created.json().key).toBe('secret');
    expect(
      (await app.inject({ method: 'DELETE', url: '/api/access/api-keys/key_1' })).statusCode,
    ).toBe(204);
    expect(calls).toEqual([
      ['listApiKeys', actor],
      ['listApiKeyRoles', actor],
      ['createApiKey', { name: 'CI', role: 'instructor', expiresInDays: 90 }, actor],
      ['deleteApiKey', 'key_1', actor],
    ]);
  });

  it('rejects an empty name, a missing role and an expiry outside 1 to 365 days', async () => {
    for (const payload of [
      { name: '', role: 'instructor' },
      { name: 'CI' },
      { name: 'CI', role: '' },
      { name: 'CI', role: 'instructor', expiresInDays: 0 },
      { name: 'CI', role: 'instructor', expiresInDays: 366 },
      { name: 'CI', role: 'instructor', expiresInDays: 1.5 },
    ]) {
      const res = await app.inject({ method: 'POST', url: '/api/access/api-keys', payload });
      expect(res.statusCode).toBe(400);
    }
    expect(calls).toEqual([]);
  });

  it('maps a refusal to 403 and a key that is not yours to 404', async () => {
    failure = new ForbiddenError('You need api_keys:write');
    const refused = await app.inject({
      method: 'POST',
      url: '/api/access/api-keys',
      payload: { name: 'CI', role: 'admin' },
    });
    expect(refused.statusCode).toBe(403);
    failure = new NotFoundError('API key', 'key_2');
    const missing = await app.inject({ method: 'DELETE', url: '/api/access/api-keys/key_2' });
    expect(missing.statusCode).toBe(404);
  });

  it('requires a session', async () => {
    session = null;
    const res = await app.inject({ method: 'GET', url: '/api/access/api-keys' });
    expect(res.statusCode).toBe(401);
  });
});
