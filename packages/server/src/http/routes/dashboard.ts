// HTTP routes for the dashboard (overview) context.
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  EnrollmentSeries,
  EnrollmentSeriesQuery,
  OverviewStats,
  refusals,
} from '../schemas/index.js';
import type { Container } from '../../app/container.js';
import { resolveActor } from '../scope.js';

export async function dashboardRoutes(app: FastifyInstance, container: Container): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.route({
    method: 'GET',
    url: '/api/overview',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'getOverview',
      tags: ['Reporting'],
      summary: 'Back-office overview stats',
      description: 'Requires `analytics:read`.',
      response: { 200: OverviewStats, ...refusals(403) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return container.reporting.admin.overview(actor);
    },
  });

  r.route({
    method: 'GET',
    url: '/api/overview/enrollments',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'getEnrollmentSeries',
      tags: ['Reporting'],
      summary: 'Enrollments granted per day over a trailing window',
      description: 'Requires `analytics:read`.',
      querystring: EnrollmentSeriesQuery,
      response: { 200: EnrollmentSeries, ...refusals(403) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return container.reporting.admin.enrollments(req.query.days, actor);
    },
  });
}
