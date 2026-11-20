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

describe("a request from an app's domain", () => {
  const GLOBEX = { id: 'org_2', name: 'Globex', slug: 'globex', externalId: 'org_2' };
  const DOMAINS: Record<string, typeof ORG> = {
    'https://learn.acme.test': ORG,
    'https://globex.platform.test': GLOBEX,
  };
  const GRANT = {
    userId: 'usr_k',
    orgId: ORG.id,
    clientId: 'api-key:key_1',
    limit: { roleKey: 'owner' },
  };
  let activeOrganizationId: string | null = ORG.id;
  let lookups: string[] = [];
  let scoped: FastifyInstance;

  beforeAll(async () => {
    scoped = Fastify();
    scoped.setErrorHandler(errorHandler);
    const world = {
      ...container,
      auth: {
        ...container.auth,
        verify: async () => ({ ...SESSION, session: { activeOrganizationId } }),
        verifyApiKey: async () => GRANT,
        handler: async () =>
          new Response(JSON.stringify({ answered: true }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
      },
      apps: {
        at: async (domain: string) => {
          lookups.push(domain);
          const organization = DOMAINS[domain];
          return organization ? { app: { id: `app_${organization.slug}` }, organization } : null;
        },
      },
      organizations: {
        ...container.organizations,
        acceptsSession: (at: { organization: typeof ORG }, authOrgId: string) =>
          at.organization.externalId === authOrgId,
        acceptsSwitch: (at: { organization: typeof ORG }, to: { organizationId?: string }) =>
          to.organizationId === undefined || to.organizationId === at.organization.externalId,
      },
    } as unknown as Container;
    registerAuth(scoped, world);
    const seen = (req: { orgId?: string }) => ({ orgId: req.orgId ?? null });
    scoped.get('/org-scoped', { preHandler: scoped.requireOrgSession }, async (req) => seen(req));
    scoped.get('/session-only', { preHandler: scoped.requireSession }, async (req) => seen(req));
    scoped.get('/open', async () => ({ ok: true }));
    await scoped.ready();
  });

  afterAll(async () => {
    await scoped.close();
  });

  beforeEach(() => {
    activeOrganizationId = ORG.id;
    lookups = [];
  });

  const get = (url: string, headers: Record<string, string>) =>
    scoped.inject({ method: 'GET', url, headers });

  it("is answered with a session for that app's organization", async () => {
    for (const url of ['/org-scoped', '/session-only']) {
      const res = await get(url, { origin: 'https://learn.acme.test' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ orgId: 'org_1' });
    }
  });

  it('is a 401 with a session for another organization', async () => {
    for (const url of ['/org-scoped', '/session-only']) {
      const res = await get(url, { origin: 'https://globex.platform.test' });
      expect(res.statusCode).toBe(401);
      expect(res.json()).toEqual({
        error: 'unauthorized',
        message: 'This session is for another organization',
      });
    }
    const referred = await get('/org-scoped', { referer: 'https://globex.platform.test/courses' });
    expect(referred.statusCode).toBe(401);
  });

  it('is answered from any other domain, whatever organization the session is for', async () => {
    const others: Record<string, string>[] = [{}, { origin: 'https://admin.example.com' }];
    for (const headers of others) {
      expect((await get('/org-scoped', headers)).statusCode).toBe(200);
    }
  });

  it('lets a session with no organization reach the routes that need none', async () => {
    activeOrganizationId = null;
    const res = await get('/session-only', { origin: 'https://globex.platform.test' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ orgId: null });
    const scopedRoute = await get('/org-scoped', { origin: 'https://globex.platform.test' });
    expect(scopedRoute.statusCode).toBe(401);
    expect(scopedRoute.json().message).toBe('Choose an organization to continue');
  });

  it('does not apply to an API key, and looks nothing up for one', async () => {
    const res = await get('/org-scoped', {
      origin: 'https://globex.platform.test',
      'x-api-key': 'hlms_good',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ orgId: 'org_1' });
    expect(lookups).toEqual([]);
  });

  it('is not looked up on a route that needs no caller', async () => {
    const res = await get('/open', { origin: 'https://globex.platform.test' });
    expect(res.statusCode).toBe(200);
    expect(lookups).toEqual([]);
    await get('/org-scoped', { origin: 'https://globex.platform.test' });
    expect(lookups).toEqual(['https://globex.platform.test']);
  });

  it('is a 401 on the sign-in routes that read the session, and only on those', async () => {
    const elsewhere = { origin: 'https://globex.platform.test' };
    for (const url of ['/api/auth/get-session', '/api/auth/organization/list']) {
      const res = await get(url, elsewhere);
      expect(res.statusCode).toBe(401);
      expect(res.json().message).toBe('This session is for another organization');
      expect((await get(url, { origin: 'https://learn.acme.test' })).statusCode).toBe(200);
      expect((await get(url, { origin: 'https://admin.example.com' })).statusCode).toBe(200);
      expect((await get(url, {})).statusCode).toBe(200);
    }
    expect((await get('/api/auth/magic-link/verify?token=t', elsewhere)).statusCode).toBe(200);
    const signOut = await scoped.inject({
      method: 'POST',
      url: '/api/auth/sign-out',
      headers: elsewhere,
      payload: {},
    });
    expect(signOut.statusCode).toBe(200);
    activeOrganizationId = null;
    expect((await get('/api/auth/get-session', elsewhere)).statusCode).toBe(200);
  });

  it("refuses switching to another organization on an app's domain", async () => {
    const switchTo = (organizationId: string, origin?: string) =>
      scoped.inject({
        method: 'POST',
        url: '/api/auth/organization/set-active',
        headers: origin ? { origin } : {},
        payload: { organizationId },
      });
    const refused = await switchTo(GLOBEX.externalId, 'https://learn.acme.test');
    expect(refused.statusCode).toBe(401);
    expect((await switchTo(ORG.externalId, 'https://learn.acme.test')).statusCode).toBe(200);
    expect((await switchTo(GLOBEX.externalId, 'https://admin.example.com')).statusCode).toBe(200);
    expect((await switchTo(GLOBEX.externalId)).statusCode).toBe(200);
  });

  it('is told by the Referer when the Origin is `null`', async () => {
    const res = await get('/org-scoped', {
      origin: 'null',
      referer: 'https://globex.platform.test/courses',
    });
    expect(res.statusCode).toBe(401);
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
