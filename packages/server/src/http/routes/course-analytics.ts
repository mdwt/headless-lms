// HTTP routes for per-course analytics (reporting).
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  CourseAnalytics,
  CourseIdParam,
  EnrollmentSeries,
  EnrollmentSeriesQuery,
  refusals,
} from '../schemas/index.js';
import { NotFoundError } from '@headless-lms/core/shared/errors';
import type { Container } from '../../app/container.js';
import { resolveScope } from '../scope.js';

export async function courseAnalyticsRoutes(
  app: FastifyInstance,
  container: Container,
): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.route({
    method: 'GET',
    url: '/api/courses/:id/analytics',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'getCourseAnalytics',
      tags: ['Reporting'],
      summary: 'Completion and engagement stats for a course (staff)',
      description: 'Staff only (owner, admin, instructor).',
      params: CourseIdParam,
      response: { 200: CourseAnalytics, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      const analytics = await container.reporting.admin.courseAnalytics(scope.orgId, req.params.id);
      if (!analytics) {
        throw new NotFoundError('Course', req.params.id);
      }
      return analytics;
    },
  });

  r.route({
    method: 'GET',
    url: '/api/courses/:id/analytics/enrollments',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'getCourseEnrollmentSeries',
      tags: ['Reporting'],
      summary: 'Enrollments granted per day for a course over a trailing window (staff)',
      description: 'Staff only (owner, admin, instructor).',
      params: CourseIdParam,
      querystring: EnrollmentSeriesQuery,
      response: { 200: EnrollmentSeries, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      const series = await container.reporting.admin.courseEnrollments(
        scope.orgId,
        req.params.id,
        req.query.days,
      );
      if (!series) {
        throw new NotFoundError('Course', req.params.id);
      }
      return series;
    },
  });
}
