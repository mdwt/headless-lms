import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { actorWith } from '@headless-lms/core/organizations';
import type { Actor } from '@headless-lms/core/shared/actor';
import { ConflictError, NotFoundError } from '@headless-lms/core/shared/errors';
import type { Container } from '../../app/container.js';
import { registerAuth } from '../plugins/auth.js';
import { errorHandler } from '../plugins/error-handler.js';
import { mcpEndpoints } from '../../app/mcp-endpoints.js';
import { organizationsRoutes } from './organizations.js';
import { appsRoutes } from './apps.js';
import { resolvedCaller } from '../test-caller.js';

const ORG = { id: 'org_1', name: 'Acme', slug: 'acme', externalId: 'org_1' };
const orgUser = { id: 'ou_staff', orgId: ORG.id, status: 'active' };
const ADMIN = actorWith({ id: orgUser.id, orgId: ORG.id, org: ['organizations:write'] });
const MEMBER = actorWith({ id: orgUser.id, orgId: ORG.id, org: [] });
let actor: Actor = ADMIN;
const NOW = new Date('2026-11-11T10:00:00.000Z');
const CLUB = {
  id: 'app_club',
  name: 'Acme Club',
  slug: 'club',
  domain: 'https://club.acme.test',
  courses: false,
  community: true,
};
const STORED = { ...CLUB, orgId: ORG.id };
const calls: unknown[][] = [];
let failure: Error | null = null;

function record(name: string, result: unknown) {
  return async (...args: unknown[]) => {
    (args.at(-1) as Actor).permissions.require(
      name === 'listApps' ? 'organizations:read' : 'organizations:write',
    );
    calls.push([name, ...args.slice(0, -1)]);
    if (failure) {
      throw failure;
    }
    return result;
  };
}

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
    updateOrganization: async (input: unknown) => {
      calls.push(['updateOrganization', input]);
      return { ...ORG, createdAt: NOW };
    },
    resendInvite: async (...args: unknown[]) => {
      calls.push(['resendInvite', args[3]]);
    },
  },
  apps: {
    list: record('listApps', [STORED]),
    create: record('createApp', STORED),
    update: record('updateApp', STORED),
    delete: record('deleteApp', undefined),
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
  await appsRoutes(app, container);
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  actor = ADMIN;
  calls.length = 0;
  failure = null;
});

const APPS = '/api/apps';
const NEW = {
  name: 'Acme Club',
  slug: 'club',
  domain: 'https://club.acme.test',
  courses: false,
  community: true,
};

describe('the organization', () => {
  it('is returned without its apps, and an update takes its name and slug only', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/organizations',
      payload: { name: 'Acme', slug: 'acme', hosts: { courses: 'https://learn.acme.test' } },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      id: ORG.id,
      name: 'Acme',
      slug: 'acme',
      createdAt: NOW.toISOString(),
    });
    expect(calls).toEqual([['updateOrganization', { name: 'Acme', slug: 'acme' }]]);
  });
});

describe('app routes', () => {
  it('lists the apps without their organization id', async () => {
    const res = await app.inject({ method: 'GET', url: APPS });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([CLUB]);
    expect(calls).toEqual([['listApps']]);
  });

  it('creates an app, passing its domain on as an origin', async () => {
    const res = await app.inject({
      method: 'POST',
      url: APPS,
      payload: { ...NEW, name: ' Acme Club ', domain: 'https://club.acme.test/' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual(CLUB);
    expect(calls).toEqual([['createApp', NEW]]);
  });

  it.each([
    { ...NEW, domain: 'https://club.acme.test/community' },
    { ...NEW, domain: 'club.acme.test' },
    { ...NEW, domain: 'ftp://club.acme.test' },
    { ...NEW, domain: null },
    { ...NEW, slug: 'Acme Club' },
    { ...NEW, slug: '' },
    { ...NEW, name: ' ' },
    { ...NEW, courses: 'yes' },
    { name: NEW.name, slug: NEW.slug, domain: NEW.domain, courses: true },
  ])('refuses %j as a new app', async (payload) => {
    const res = await app.inject({ method: 'POST', url: APPS, payload: payload as object });
    expect(res.statusCode).toBe(400);
    expect(calls).toEqual([]);
  });

  it('changes only what is sent', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `${APPS}/app_club`,
      payload: { domain: 'https://circle.acme.test/' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(CLUB);
    expect(calls).toEqual([['updateApp', 'app_club', { domain: 'https://circle.acme.test' }]]);
  });

  it('refuses a change to a domain with a path', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `${APPS}/app_club`,
      payload: { domain: 'https://circle.acme.test/c' },
    });
    expect(res.statusCode).toBe(400);
    expect(calls).toEqual([]);
  });

  it('deletes an app', async () => {
    const res = await app.inject({ method: 'DELETE', url: `${APPS}/app_club` });
    expect(res.statusCode).toBe(204);
    expect(calls).toEqual([['deleteApp', 'app_club']]);
  });

  it('answers 409 for a domain another app has and 404 for an app that is not there', async () => {
    failure = new ConflictError('That domain is already in use');
    const taken = await app.inject({ method: 'POST', url: APPS, payload: NEW });
    expect(taken.statusCode).toBe(409);
    expect(taken.json()).toMatchObject({ message: 'That domain is already in use' });
    failure = new NotFoundError('App', 'app_gone');
    const gone = await app.inject({ method: 'DELETE', url: `${APPS}/app_gone` });
    expect(gone.statusCode).toBe(404);
  });

  it('answers 403 without the permission', async () => {
    actor = MEMBER;
    expect((await app.inject({ method: 'GET', url: APPS })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: APPS, payload: NEW })).statusCode).toBe(403);
    expect(
      (await app.inject({ method: 'PATCH', url: `${APPS}/app_club`, payload: {} })).statusCode,
    ).toBe(403);
    expect((await app.inject({ method: 'DELETE', url: `${APPS}/app_club` })).statusCode).toBe(403);
    expect(calls).toEqual([]);
  });
});

describe('an invite link', () => {
  it('is resent with no domain, and a named domain is passed on as an origin', async () => {
    const url = '/api/organizations/people/ou_9/invite/resend';
    expect((await app.inject({ method: 'POST', url })).statusCode).toBe(204);
    const named = await app.inject({
      method: 'POST',
      url,
      query: { domain: 'https://club.acme.test/' },
    });
    expect(named.statusCode).toBe(204);
    expect(calls).toEqual([
      ['resendInvite', undefined],
      ['resendInvite', 'https://club.acme.test'],
    ]);
  });
});
