import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Container } from '../../app/container.js';
import { registerAuth } from './auth.js';

// Better Auth ids *are* the domain ids: the org/user create hooks hand their
// generated domain id back to better-auth, and record it as the external id —
// so `ba_organization.id`, `organizations.id` and `external_id` all match.
const ORG = { id: 'org_1', name: 'Acme', slug: 'acme', externalId: 'org_1' };
const SESSION = {
  user: { id: 'usr_1', email: 'a@b.c' },
  session: { activeOrganizationId: ORG.id },
};

const logContext: Record<string, unknown>[] = [];

const container = {
  requestContext: { set: (fields: Record<string, unknown>) => logContext.push(fields) },
  auth: { verify: async () => SESSION, handler: async () => new Response(null) },
  organizations: {
    getById: async (id: string) => (id === ORG.id ? ORG : null),
    getByExternalId: async (externalId: string) => (externalId === ORG.externalId ? ORG : null),
  },
} as unknown as Container;

let app: FastifyInstance;

beforeAll(async () => {
  app = Fastify();
  registerAuth(app, container);
  const seen = (req: {
    authOrgId?: string;
    orgId?: string;
    userId?: string;
  }): Record<string, string | null> => ({
    authOrgId: req.authOrgId ?? null,
    orgId: req.orgId ?? null,
    userId: req.userId ?? null,
  });
  app.get('/org-scoped', { preHandler: app.requireOrgSession }, async (req) => seen(req));
  app.get('/session-only', { preHandler: app.requireSession }, async (req) => seen(req));
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe('requireOrgSession', () => {
  // resolveScope refuses the request with "no active organization in session"
  // unless the guard leaves *both* ids on it.
  it('leaves the active org on the request as both the auth id and the domain id', async () => {
    const res = await app.inject({ method: 'GET', url: '/org-scoped' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ authOrgId: 'org_1', orgId: 'org_1', userId: 'usr_1' });
  });

  it('puts the org on the request log context', async () => {
    logContext.length = 0;
    await app.inject({ method: 'GET', url: '/org-scoped' });
    expect(logContext).toEqual([{ orgId: 'org_1' }]);
  });
});

describe('requireSession', () => {
  it('resolves the active org when the session carries one', async () => {
    const res = await app.inject({ method: 'GET', url: '/session-only' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ authOrgId: 'org_1', orgId: 'org_1', userId: 'usr_1' });
  });
});
