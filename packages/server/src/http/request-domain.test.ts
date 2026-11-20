import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Container } from '../app/container.js';
import { requestApp } from './request-domain.js';

const ACME = { id: 'org_acme', externalId: 'org_acme', name: 'Acme' };
const CLUB = { orgId: ACME.id, id: 'app_club', domain: 'https://club.acme.test' };

let lookups: string[] = [];
let logContext: Record<string, unknown>[] = [];

const container = {
  apps: {
    at: async (domain: string) => {
      lookups.push(domain);
      return domain === CLUB.domain ? { app: CLUB, organization: ACME } : null;
    },
  },
  requestContext: { set: (fields: Record<string, unknown>) => logContext.push(fields) },
} as unknown as Container;

let app: FastifyInstance;

beforeAll(async () => {
  app = Fastify();
  app.all('/seen', async (req) => {
    const [first, second] = await Promise.all([
      requestApp(container, req),
      requestApp(container, req),
    ]);
    return { appId: first?.app.id ?? null, same: first === second };
  });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  lookups = [];
  logContext = [];
});

const seen = async (headers: Record<string, string>, method: 'GET' | 'POST' = 'GET') =>
  (await app.inject({ method, url: '/seen', headers })).json() as {
    appId: string | null;
    same: boolean;
  };

describe("the app of a request's domain", () => {
  it('is looked up once for a request, and logged with the app id', async () => {
    expect(await seen({ origin: CLUB.domain }, 'POST')).toEqual({ appId: 'app_club', same: true });
    expect(lookups).toEqual([CLUB.domain]);
    expect(logContext).toEqual([{ appId: 'app_club' }]);
  });

  it('is known by the Referer when there is no Origin', async () => {
    expect((await seen({ referer: `${CLUB.domain}/events/evn_1` })).appId).toBe('app_club');
    expect(lookups).toEqual([CLUB.domain]);
  });

  it('is known by the Referer when the Origin is not a web address', async () => {
    for (const origin of ['null', 'ftp://club.acme.test', 'not a url']) {
      expect((await seen({ origin, referer: `${CLUB.domain}/` })).appId).toBe('app_club');
    }
  });

  it('takes the Origin over the Referer', async () => {
    const at = await seen({ origin: 'https://elsewhere.test', referer: `${CLUB.domain}/` });
    expect(at.appId).toBeNull();
    expect(lookups).toEqual(['https://elsewhere.test']);
    expect(logContext).toEqual([]);
  });

  it('is none when the request carries no domain, and nothing is looked up', async () => {
    expect((await seen({})).appId).toBeNull();
    expect((await seen({ origin: 'null' })).appId).toBeNull();
    expect((await seen({ origin: 'https://*' })).appId).toBeNull();
    expect((await seen({ origin: 'https://*.acme.test' })).appId).toBeNull();
    expect(lookups).toEqual([]);
  });
});
