import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { actorWith } from '@headless-lms/core/organizations';
import type { Actor } from '@headless-lms/core/shared/actor';
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
const HOSTS = { courses: 'https://learn.acme.test', community: 'https://club.acme.test' };
const NOW = new Date('2026-11-11T10:00:00.000Z');
const updates: unknown[] = [];
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
    updateOrganization: async (input: { hosts?: typeof HOSTS }) => {
      updates.push(input);
      return { ...ORG, createdAt: NOW, hosts: input.hosts ?? HOSTS };
    },
    resendInvite: async (...args: unknown[]) => {
      resent.push(args);
    },
  },
  identity: { getUserByExternalId: async () => ({ id: 'usr_1' }) },
  requestContext: { set: () => {} },
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

beforeEach(() => {
  actor = ADMIN;
  updates.length = 0;
  resent.length = 0;
});

const patch = (payload: unknown) =>
  app.inject({ method: 'PATCH', url: '/api/organizations', payload: payload as object });

describe('organization hosts', () => {
  it('returns the hosts with the organization', async () => {
    const res = await patch({ name: 'Acme', slug: 'acme' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      id: ORG.id,
      name: 'Acme',
      slug: 'acme',
      createdAt: NOW.toISOString(),
      hosts: HOSTS,
    });
    expect(updates).toEqual([{ name: 'Acme', slug: 'acme' }]);
  });

  it('passes new hosts on as origins', async () => {
    const res = await patch({
      name: 'Acme',
      slug: 'acme',
      hosts: { courses: 'https://school.acme.test/', community: 'https://club.acme.test' },
    });
    const hosts = { courses: 'https://school.acme.test', community: 'https://club.acme.test' };
    expect(res.json()).toMatchObject({ hosts });
    expect(updates).toEqual([{ name: 'Acme', slug: 'acme', hosts }]);
  });

  it.each([
    { courses: 'https://learn.acme.test/courses', community: 'https://club.acme.test' },
    { courses: 'learn.acme.test', community: 'https://club.acme.test' },
    { courses: 'ftp://learn.acme.test', community: 'https://club.acme.test' },
    { courses: null, community: 'https://club.acme.test' },
    { community: 'https://club.acme.test' },
  ])('refuses %j as hosts', async (hosts) => {
    const res = await patch({ name: 'Acme', slug: 'acme', hosts });
    expect(res.statusCode).toBe(400);
    expect(updates).toEqual([]);
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
