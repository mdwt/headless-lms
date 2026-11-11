import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { actorWith, OrgHostSettings } from '@headless-lms/core/organizations';
import type { Actor } from '@headless-lms/core/shared/actor';
import { SettingsService, type SettingsRepository } from '@headless-lms/core/shared/settings';
import type { Container } from '../../app/container.js';
import { registerAuth } from '../plugins/auth.js';
import { errorHandler } from '../plugins/error-handler.js';
import { mcpEndpoints } from '../../app/mcp-endpoints.js';
import { organizationsRoutes } from './organizations.js';
import { resolvedCaller } from '../test-caller.js';

const ORG = { id: 'org_1', name: 'Acme', slug: 'acme', externalId: 'org_1' };
const orgUser = { id: 'ou_staff', orgId: ORG.id, status: 'active' };
const ADMIN = actorWith({ id: orgUser.id, orgId: ORG.id, org: ['organizations:write'] });
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
const hosts = new OrgHostSettings({
  settings: new SettingsService(settingsRepo),
  platformHost: 'https://platform.test',
});
const resent: unknown[][] = [];

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
    resolveCaller: async () => resolvedCaller(ORG, { id: 'usr_1' }, orgUser, actor),
    resendInvite: async (...args: unknown[]) => {
      resent.push(args);
    },
  },
  identity: { getUserByExternalId: async () => ({ id: 'usr_1' }) },
  requestContext: { set: () => {} },
  hosts,
} as unknown as Container;

let app: FastifyInstance;

beforeAll(async () => {
  app = Fastify();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.setErrorHandler(errorHandler);
  registerAuth(app, container);
  await organizationsRoutes(app, container);
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

const STARTED = {
  courses: 'https://acme.platform.test',
  community: 'https://acme.platform.test',
};

beforeEach(async () => {
  actor = ADMIN;
  rows.clear();
  resent.length = 0;
  await hosts.assign(ORG.id, ORG.slug);
});

const put = (payload: unknown) =>
  app.inject({ method: 'PUT', url: '/api/organizations/hosts', payload: payload as object });

describe('organization hosts', () => {
  it('answers the host the organization was created with for both apps', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/organizations/hosts' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(STARTED);
  });

  it('stores the hosts as origins and returns them on the next read', async () => {
    const res = await put({
      courses: 'https://learn.acme.test/',
      community: 'https://club.acme.test',
    });
    expect(res.statusCode).toBe(200);
    const stored = { courses: 'https://learn.acme.test', community: 'https://club.acme.test' };
    expect(res.json()).toEqual(stored);
    const read = await app.inject({ method: 'GET', url: '/api/organizations/hosts' });
    expect(read.json()).toEqual(stored);
    expect(await hosts.resolve(ORG.id)).toEqual(stored);
  });

  it.each([
    { courses: null, community: 'https://club.acme.test' },
    { community: 'https://club.acme.test' },
  ])('refuses a replace that leaves a host out', async (payload) => {
    expect((await put(payload)).statusCode).toBe(400);
    expect(await hosts.resolve(ORG.id)).toEqual(STARTED);
  });

  it.each(['https://learn.acme.test/courses', 'learn.acme.test', 'ftp://learn.acme.test'])(
    'refuses %s as a host',
    async (courses) => {
      const res = await put({ courses, community: 'https://club.acme.test' });
      expect(res.statusCode).toBe(400);
      expect(await hosts.resolve(ORG.id)).toEqual(STARTED);
    },
  );

  it('refuses a caller without organizations:write, and a read without organizations:read', async () => {
    actor = actorWith({ id: orgUser.id, orgId: ORG.id, org: ['organizations:read'] });
    expect((await put(STARTED)).statusCode).toBe(403);
    actor = actorWith({ id: orgUser.id, orgId: ORG.id, org: [] });
    const read = await app.inject({ method: 'GET', url: '/api/organizations/hosts' });
    expect(read.statusCode).toBe(403);
  });

  it('resends an invite with no host, and passes a named host on', async () => {
    const url = '/api/organizations/people/ou_9/invite/resend';
    expect((await app.inject({ method: 'POST', url })).statusCode).toBe(204);
    const named = await app.inject({
      method: 'POST',
      url,
      query: { host: 'https://club.acme.test/' },
    });
    expect(named.statusCode).toBe(204);
    expect(resent.map((args) => args[3])).toEqual([undefined, 'https://club.acme.test']);
  });
});
