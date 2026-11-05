// HTTP routes for per-course analytics (reporting).
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  CourseAnalytics,
  CourseIdParam,
  CourseIdPathParam,
  CourseLearnersPage,
  CourseLearnersQuery,
  EnrollmentSeries,
  EnrollmentSeriesQuery,
  refusals,
} from '../schemas/index.js';
import type { Container } from '../../app/container.js';
import { resolveActor } from '../scope.js';
import { describeOperation } from '../operations.js';

export async function courseAnalyticsRoutes(
  app: FastifyInstance,
  container: Container,
): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.route({
    method: 'GET',
    url: '/api/courses/:id/analytics',
    config: { operation: 'reporting.admin.courseAnalytics' },
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'getCourseAnalytics',
      tags: ['Reporting'],
      summary: 'Completion and engagement stats for a course',
      description: describeOperation('reporting.admin.courseAnalytics'),
      params: CourseIdParam,
      response: { 200: CourseAnalytics, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return container.reporting.admin.courseAnalytics(req.params.id, actor);
    },
  });

  r.route({
    method: 'GET',
    url: '/api/courses/:id/analytics/enrollments',
    config: { operation: 'reporting.admin.courseEnrollments' },
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'getCourseEnrollmentSeries',
      tags: ['Reporting'],
      summary: 'Enrollments granted per day for a course over a trailing window',
      description: describeOperation('reporting.admin.courseEnrollments'),
      params: CourseIdParam,
      querystring: EnrollmentSeriesQuery,
      response: { 200: EnrollmentSeries, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return container.reporting.admin.courseEnrollments(req.params.id, req.query.days, actor);
    },
  });

  r.route({
    method: 'GET',
    url: '/api/courses/:courseId/learners',
    config: { operation: 'reporting.admin.courseLearners' },
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'listCourseLearners',
      tags: ['Reporting'],
      summary: "List a course's learners with their access and progress",
      description: `${describeOperation('reporting.admin.courseLearners')} Everyone with a grant that opens the course, directly or through a bundle, active or not, each with that grant and their progress. Paged and searched by name or email.`,
      params: CourseIdPathParam,
      querystring: CourseLearnersQuery,
      response: { 200: CourseLearnersPage, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return container.reporting.admin.courseLearners(req.params.courseId, req.query, actor);
    },
  });
}
