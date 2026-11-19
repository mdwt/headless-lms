import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Container } from '../../app/container.js';
import { registerAppDomain } from './app-domain.js';

const ACME = { id: 'org_acme', externalId: 'org_acme', name: 'Acme' };
const CLUB = { orgId: ACME.id, id: 'app_club', domain: 'https://club.acme.test' };

let lookups: string[] = [];
let logContext: Record<string, unknown>[] = [];

const container = {
  organizations: {
    lookupDomain: async (domain: string) => {
      lookups.push(domain);
      return domain === CLUB.domain ? { app: CLUB, organization: ACME } : null;
    },
  },
  requestContext: { set: (fields: Record<string, unknown>) => logContext.push(fields) },
} as unknown as Container;

let app: FastifyInstance;

beforeAll(async () => {
  app = Fastify();
  registerAppDomain(app, container);
  app.all('/seen', async (req) => ({ appId: req.appAt?.app.id ?? null }));
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  lookups = [];
  logContext = [];
});

const seen = async (headers: Record<string, string>, method: 'GET' | 'POST' | 'OPTIONS' = 'GET') =>
  (await app.inject({ method, url: '/seen', headers })).json() as { appId: string | null };

describe("a request from an app's domain", () => {
  it('carries its app, and is logged with the app id', async () => {
    expect(await seen({ origin: CLUB.domain }, 'POST')).toEqual({ appId: 'app_club' });
    expect(logContext).toEqual([{ appId: 'app_club' }]);
  });

  it('is known by its Referer when it has no Origin', async () => {
    expect(await seen({ referer: `${CLUB.domain}/events/evn_1` })).toEqual({ appId: 'app_club' });
    expect(lookups).toEqual([CLUB.domain]);
  });

  it('takes the Origin over the Referer', async () => {
    expect(await seen({ origin: 'https://elsewhere.test', referer: `${CLUB.domain}/` })).toEqual({
      appId: null,
    });
    expect(lookups).toEqual(['https://elsewhere.test']);
    expect(logContext).toEqual([]);
  });

  it('has no app when it carries no domain, and nothing is looked up', async () => {
    expect(await seen({})).toEqual({ appId: null });
    expect(await seen({ origin: 'null' })).toEqual({ appId: null });
    expect(await seen({ origin: 'ftp://club.acme.test' })).toEqual({ appId: null });
    expect(lookups).toEqual([]);
  });

  it('is not looked up for a preflight', async () => {
    await seen({ origin: CLUB.domain }, 'OPTIONS');
    expect(lookups).toEqual([]);
  });
});
