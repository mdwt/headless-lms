import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import type { Container } from '../../app/container.js';
import { registerAppDomain } from '../plugins/app-domain.js';
import { errorHandler } from '../plugins/error-handler.js';
import { appRoutes } from './app.js';

const ACME = { id: 'org_acme', externalId: 'org_acme', name: 'Acme', slug: 'acme', metadata: {} };
const LEARN = {
  orgId: ACME.id,
  id: 'app_learn',
  name: 'Acme Academy',
  slug: 'academy',
  domain: 'https://learn.acme.test',
  courses: true,
  community: false,
};

let lookups: string[] = [];
let logContext: Record<string, unknown>[] = [];

const container = {
  auth: {
    clientIp: (headers: Record<string, string | undefined>) => headers['x-forwarded-for'] ?? null,
  },
  organizations: {
    lookupDomain: async (domain: string) => {
      lookups.push(domain);
      return domain === LEARN.domain ? { app: LEARN, organization: ACME } : null;
    },
  },
  requestContext: { set: (fields: Record<string, unknown>) => logContext.push(fields) },
} as unknown as Container;

let app: FastifyInstance;

beforeEach(async () => {
  lookups = [];
  logContext = [];
  app = Fastify();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.setErrorHandler(errorHandler);
  registerAppDomain(app, container);
  await appRoutes(app, container);
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

const lookup = (headers: Record<string, string> = {}) =>
  app.inject({ method: 'GET', url: '/api/app', headers });

describe('GET /api/app', () => {
  it('answers with the organization and the app of the Origin, and nothing else', async () => {
    const res = await lookup({ origin: LEARN.domain });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      organization: { name: 'Acme' },
      app: { name: 'Acme Academy', courses: true, community: false },
    });
    expect(lookups).toEqual([LEARN.domain]);
  });

  it('answers for the Referer when there is no Origin', async () => {
    const res = await lookup({ referer: `${LEARN.domain}/login?next=%2F` });
    expect(res.statusCode).toBe(200);
    expect(res.json().app.name).toBe('Acme Academy');
  });

  it("answers 404 for a domain that is no app's", async () => {
    const res = await lookup({ origin: 'https://elsewhere.test' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'not_found', message: 'App not found' });
  });

  it('answers 404 for a request that carries no domain, without looking anything up', async () => {
    expect((await lookup()).statusCode).toBe(404);
    expect((await lookup({ origin: 'null' })).statusCode).toBe(404);
    expect((await lookup({ origin: 'not a url' })).statusCode).toBe(404);
    expect(lookups).toEqual([]);
  });

  it('takes no domain as a parameter', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/app?domain=${encodeURIComponent(LEARN.domain)}`,
    });
    expect(res.statusCode).toBe(404);
  });

  it('puts the app on the request log context', async () => {
    await lookup({ origin: LEARN.domain });
    await lookup({ origin: 'https://elsewhere.test' });
    expect(logContext).toEqual([{ appId: 'app_learn' }]);
  });

  it('limits each visitor IP address on its own, and says when to come back', async () => {
    const sarah = { origin: LEARN.domain, 'x-forwarded-for': '203.0.113.7' };
    const james = { origin: 'https://elsewhere.test', 'x-forwarded-for': '203.0.113.8' };
    for (let i = 0; i < 100; i++) {
      expect((await lookup(sarah)).statusCode).toBe(200);
    }
    const limited = await lookup(sarah);
    expect(limited.statusCode).toBe(429);
    expect(limited.json()).toMatchObject({ error: 'too_many_requests' });
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    expect(Number(limited.headers['retry-after'])).toBeLessThanOrEqual(10);
    expect((await lookup(james)).statusCode).toBe(404);
  });

  it('limits by the address of the connection when no forwarded address is trusted', async () => {
    for (let i = 0; i < 100; i++) {
      await lookup({ origin: LEARN.domain });
    }
    expect((await lookup({ origin: LEARN.domain })).statusCode).toBe(429);
    expect(
      (await lookup({ origin: LEARN.domain, 'x-forwarded-for': '203.0.113.9' })).statusCode,
    ).toBe(200);
  });
});
