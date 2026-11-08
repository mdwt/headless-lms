import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import type { Container } from '../../../app/container.js';
import { registerAuth } from '../../plugins/auth.js';
import { errorHandler } from '../../plugins/error-handler.js';
import { memberEventsRoutes } from './events.js';
import { eventsRoutes } from '../events.js';
import { mcpEndpoints } from '../../../app/mcp-endpoints.js';
import { actorWith } from '@headless-lms/core/organizations';
import { NotFoundError } from '@headless-lms/core/shared/errors';
import type { Actor } from '@headless-lms/core/shared/actor';
import { resolvedCaller } from '../../test-caller.js';

const ORG = { id: 'org_1', name: 'Acme', slug: 'acme', externalId: 'org_1' };
const JAMES = actorWith({ id: 'ou_james', orgId: ORG.id });
const ICS = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n';

const member = {
  listEvents: vi.fn(async () => ({ rows: [], total: 0, page: 1, pageSize: 20 })),
  eventCalendar: vi.fn(async () => ICS),
};
const entitlements = {
  grant: vi.fn(async () => {
    throw new NotFoundError('Event', 'crs_1');
  }),
  revoke: vi.fn(async () => {
    throw new NotFoundError('Event', 'crs_1');
  }),
};
let actor: Actor = JAMES;

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
    getOrgUser: async () => ({ id: actor.id, orgId: ORG.id }),
    actorFor: async () => actor,
    resolveCaller: async () =>
      resolvedCaller(ORG, { id: 'usr_1' }, { id: actor.id, orgId: ORG.id }, actor),
  },
  identity: { getUserByExternalId: async () => ({ id: 'usr_1' }) },
  requestContext: { set: () => {} },
  reporting: { member },
  content: {},
  entitlements,
} as unknown as Container;

let app: FastifyInstance;

beforeAll(async () => {
  app = Fastify();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.setErrorHandler(errorHandler);
  registerAuth(app, container);
  await memberEventsRoutes(app, container);
  await eventsRoutes(app, container);
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  actor = JAMES;
  vi.clearAllMocks();
});

describe('member event routes', () => {
  it('serves the calendar file as text/calendar, unchanged', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/member/events/evn_1/calendar' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('text/calendar; charset=utf-8');
    expect(res.headers['content-disposition']).toBe('attachment; filename="evn_1.ics"');
    expect(res.body).toBe(ICS);
    expect(member.eventCalendar).toHaveBeenCalledWith('evn_1', JAMES);
  });

  it('reads when and attending from the query', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/member/events?when=past&attending=true',
    });
    expect(res.statusCode).toBe(200);
    expect(member.listEvents).toHaveBeenCalledWith(
      { page: 1, pageSize: 20, when: 'past', attending: true },
      JAMES,
    );
  });

  it('asks for an event on every attendee route, so another id answers 404', async () => {
    const calls = [
      {
        method: 'POST' as const,
        url: '/api/events/crs_1/attendees',
        payload: { orgUserId: 'ou_emma' },
      },
      { method: 'DELETE' as const, url: '/api/events/crs_1/attendees/ou_emma' },
      {
        method: 'POST' as const,
        url: '/api/member/events/crs_1/attendees',
        payload: { orgUserId: 'ou_emma' },
      },
      { method: 'DELETE' as const, url: '/api/member/events/crs_1/attendees/ou_emma' },
      { method: 'POST' as const, url: '/api/member/events/crs_1/registration' },
      { method: 'DELETE' as const, url: '/api/member/events/crs_1/registration' },
    ];
    for (const call of calls) {
      const res = await app.inject(call);
      expect(res.statusCode, call.url).toBe(404);
    }
    for (const [input] of [
      ...entitlements.grant.mock.calls,
      ...entitlements.revoke.mock.calls,
    ] as unknown as [{ contentType?: string }][]) {
      expect(input.contentType).toBe('event');
    }
    expect(entitlements.grant).toHaveBeenCalledTimes(3);
    expect(entitlements.revoke).toHaveBeenCalledTimes(3);
  });
});
