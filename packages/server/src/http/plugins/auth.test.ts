import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Container } from '../../app/container.js';
import { mcpEndpoints } from '../../app/mcp-endpoints.js';
import { registerAuth } from './auth.js';
import { errorHandler } from './error-handler.js';

// Better Auth ids *are* the domain ids: the org/user create hooks hand their
// generated domain id back to better-auth, and record it as the external id —
// so `ba_organization.id`, `organizations.id` and `external_id` all match.
const ORG = { id: 'org_1', name: 'Acme', slug: 'acme', externalId: 'org_1' };
const SESSION = {
  user: { id: 'usr_1', email: 'a@b.c' },
  session: { activeOrganizationId: ORG.id },
};

const logContext: Record<string, unknown>[] = [];
const resolved: { authOrgId: string; authUserId: string }[] = [];

const container = {
  mcp: mcpEndpoints({
    authBaseURL: 'https://lms.example.com',
    adminAppUrl: 'https://admin.example.com',
  }),
  requestContext: { set: (fields: Record<string, unknown>) => logContext.push(fields) },
  auth: { verify: async () => SESSION, handler: async () => new Response(null) },
  organizations: {
    resolveCaller: async (authOrgId: string, authUserId: string) => {
      resolved.push({ authOrgId, authUserId });
      return authOrgId === ORG.externalId
        ? { orgId: ORG.id, userId: authUserId, orgUserId: 'ou_1', actor: null }
        : null;
    },
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

  it('resolves the caller with one read and leaves it on the request', async () => {
    resolved.length = 0;
    const res = await app.inject({ method: 'GET', url: '/org-scoped' });
    expect(res.statusCode).toBe(200);
    expect(resolved).toEqual([{ authOrgId: 'org_1', authUserId: 'usr_1' }]);
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

describe('api keys', () => {
  const GRANT = {
    userId: 'usr_k',
    orgId: ORG.id,
    clientId: 'api-key:key_1',
    limit: { roleKey: 'instructor' },
  };
  const limits: unknown[] = [];
  let sessionChecks = 0;
  let keyChecks = 0;
  let keyed: FastifyInstance;

  beforeAll(async () => {
    keyed = Fastify();
    keyed.setErrorHandler(errorHandler);
    registerAuth(keyed, {
      ...container,
      auth: {
        ...container.auth,
        verify: async () => {
          sessionChecks += 1;
          return SESSION;
        },
        verifyApiKey: async (headers: Record<string, unknown>) => {
          keyChecks += 1;
          return headers['x-api-key'] === 'hlms_good' ||
            headers.authorization === 'Bearer hlms_good'
            ? GRANT
            : null;
        },
      },
      organizations: {
        resolveCaller: async (authOrgId: string, authUserId: string, limit?: unknown) => {
          limits.push(limit);
          return authOrgId === ORG.id
            ? { orgId: ORG.id, userId: authUserId, orgUserId: 'ou_k', actor: null }
            : null;
        },
      },
    } as unknown as Container);
    const seen = (req: { authOrgId?: string; orgId?: string; authUserId?: string }) => ({
      authOrgId: req.authOrgId ?? null,
      orgId: req.orgId ?? null,
      authUserId: req.authUserId ?? null,
    });
    keyed.register(async (scoped) => {
      scoped.addHook('onRequest', scoped.requireOrgSession);
      scoped.get('/org-scoped', { preHandler: scoped.requireOrgSession }, async (req) => seen(req));
    });
    keyed.get('/session-only', { preHandler: keyed.requireSession }, async (req) => seen(req));
    await keyed.ready();
  });

  afterAll(async () => {
    await keyed.close();
  });

  beforeEach(() => {
    limits.length = 0;
    sessionChecks = 0;
    keyChecks = 0;
  });

  it("acts as the key's creator in the key's org, limited to the key's role, checked once", async () => {
    for (const headers of [{ 'x-api-key': 'hlms_good' }, { authorization: 'Bearer hlms_good' }]) {
      const res = await keyed.inject({ method: 'GET', url: '/org-scoped', headers });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ authOrgId: 'org_1', orgId: 'org_1', authUserId: 'usr_k' });
    }
    expect(limits).toEqual([{ roleKey: 'instructor' }, { roleKey: 'instructor' }]);
    expect(keyChecks).toBe(2);
  });

  it('refuses a bad key with 401 and never falls back to the session cookie', async () => {
    const res = await keyed.inject({
      method: 'GET',
      url: '/org-scoped',
      headers: { 'x-api-key': 'hlms_bad', cookie: 'session=1' },
    });
    expect(res.statusCode).toBe(401);
    expect(sessionChecks).toBe(0);
  });

  it('refuses a key on a route that needs a session', async () => {
    const res = await keyed.inject({
      method: 'GET',
      url: '/session-only',
      headers: { 'x-api-key': 'hlms_good' },
    });
    expect(res.statusCode).toBe(401);
    expect(keyChecks).toBe(0);
  });
});

describe('better-auth catch-all', () => {
  it('forwards form-encoded bodies verbatim', async () => {
    const echo = Fastify();
    registerAuth(echo, {
      ...container,
      auth: {
        ...container.auth,
        handler: async (request: Request) =>
          new Response(
            JSON.stringify({
              type: request.headers.get('content-type'),
              body: await request.text(),
            }),
            { headers: { 'content-type': 'application/json' } },
          ),
      },
    } as unknown as Container);
    await echo.ready();
    const res = await echo.inject({
      method: 'POST',
      url: '/api/auth/oauth2/token',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'grant_type=authorization_code&code=abc',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      type: 'application/x-www-form-urlencoded',
      body: 'grant_type=authorization_code&code=abc',
    });
    await echo.close();
  });

  it('builds the request url on the public api origin, not the internal host', async () => {
    const echo = Fastify();
    registerAuth(echo, {
      ...container,
      auth: {
        ...container.auth,
        handler: async (request: Request) => new Response(JSON.stringify({ url: request.url })),
      },
    } as unknown as Container);
    await echo.ready();
    const res = await echo.inject({
      method: 'POST',
      url: '/api/auth/oauth2/token?x=1',
      headers: { host: 'api:8000', 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'grant_type=authorization_code&code=abc',
    });
    expect(res.json()).toEqual({ url: 'https://lms.example.com/api/auth/oauth2/token?x=1' });
    await echo.close();
  });
});
