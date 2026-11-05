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
import { describeOperation } from '../operations.js';

export async function dashboardRoutes(app: FastifyInstance, container: Container): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.route({
    method: 'GET',
    url: '/api/overview',
    config: { operation: 'reporting.admin.overview' },
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'getOverview',
      tags: ['Reporting'],
      summary: 'Back-office overview stats',
      description: describeOperation('reporting.admin.overview'),
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
    config: { operation: 'reporting.admin.enrollments' },
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'getEnrollmentSeries',
      tags: ['Reporting'],
      summary: 'Enrollments granted per day over a trailing window',
      description: describeOperation('reporting.admin.enrollments'),
      querystring: EnrollmentSeriesQuery,
      response: { 200: EnrollmentSeries, ...refusals(403) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return container.reporting.admin.enrollments(req.query.days, actor);
    },
  });
}
