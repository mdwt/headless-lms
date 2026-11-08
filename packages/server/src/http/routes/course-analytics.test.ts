import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import type { Container } from '../../app/container.js';
import { registerAuth } from '../plugins/auth.js';
import { errorHandler } from '../plugins/error-handler.js';
import { courseAnalyticsRoutes } from './course-analytics.js';
import { mcpEndpoints } from '../../app/mcp-endpoints.js';
import { actorWith } from '@headless-lms/core/organizations';
import type { Actor } from '@headless-lms/core/shared/actor';
import {
  AdminReportServiceImpl,
  type AdminReportRepository,
  type CourseLearner,
} from '@headless-lms/core/reporting/admin';
import { resolvedCaller } from '../test-caller.js';

const ORG = { id: 'org_1', name: 'Acme', slug: 'acme', externalId: 'org_1' };
const JAMES = actorWith({ id: 'ou_james', orgId: ORG.id, content: { crs_1: ['progress:read'] } });

const LEARNER: CourseLearner = {
  id: 'ou_sarah',
  firstName: 'Sarah',
  lastName: 'Jones',
  email: 'sarah@example.com',
  image: null,
  status: 'active',
  source: 'manual',
  grantedAt: '2026-10-01T00:00:00.000Z',
  expiresAt: null,
  totalActivities: 4,
  completedActivities: 1,
  progress: 25,
  lastActivityAt: '2026-10-02T00:00:00.000Z',
  completedAt: null,
};

const courseLearners = vi.fn<AdminReportRepository['courseLearners']>();
const admin = new AdminReportServiceImpl({
  repo: { courseLearners } as unknown as AdminReportRepository,
  permissions: { permissionsOfMany: async () => new Map() },
  spaces: { everySpaceOpeners: async () => [] },
  events: { findEvent: async () => null },
  fileUrls: { personImage: (id) => `https://api.test/${id}` },
});
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
  reporting: { admin },
} as unknown as Container;

let app: FastifyInstance;

beforeAll(async () => {
  app = Fastify();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.setErrorHandler(errorHandler);
  registerAuth(app, container);
  await courseAnalyticsRoutes(app, container);
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  actor = JAMES;
  courseLearners.mockReset();
  courseLearners.mockResolvedValue({ rows: [LEARNER], total: 1, page: 1, pageSize: 20 });
});

describe('course learners route', () => {
  it('lists the learners of a course to a progress:read holder on it', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/courses/crs_1/learners?search=sarah',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ rows: [LEARNER], total: 1, page: 1, pageSize: 20 });
    expect(courseLearners).toHaveBeenCalledWith('org_1', 'crs_1', {
      page: 1,
      pageSize: 20,
      search: 'sarah',
    });
  });

  it('refuses another course', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/courses/crs_2/learners' });
    expect(res.statusCode).toBe(403);
    expect(courseLearners).not.toHaveBeenCalled();
  });

  it('refuses anyone without progress:read', async () => {
    actor = actorWith({ id: 'ou_emma', orgId: ORG.id, content: { crs_1: ['courses:write'] } });
    const res = await app.inject({ method: 'GET', url: '/api/courses/crs_1/learners' });
    expect(res.statusCode).toBe(403);
    expect(courseLearners).not.toHaveBeenCalled();
  });

  it('answers 404 for a course that does not exist', async () => {
    courseLearners.mockResolvedValue(null);
    const res = await app.inject({ method: 'GET', url: '/api/courses/crs_1/learners' });
    expect(res.statusCode).toBe(404);
  });
});
