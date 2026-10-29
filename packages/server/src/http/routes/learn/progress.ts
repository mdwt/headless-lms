import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  CourseProgress,
  ErrorBody,
  LearnCourseIdParam,
  ProgressStatus,
  ReportProgress,
} from '../../schemas/index.js';
import { NotFoundError } from '@headless-lms/core/shared/errors';
import type { Container } from '../../../app/container.js';
import { UnauthorizedError } from '../../plugins/auth.js';

export async function learnProgressRoutes(
  app: FastifyInstance,
  container: Container,
): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const learn = container.reporting.learn;

  r.route({
    method: 'POST',
    url: '/api/learn/progress',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'reportProgress',
      tags: ['Progress'],
      summary: 'Report usage on a target; the progress service decides completion',
      body: ReportProgress,
      response: { 200: ProgressStatus, 404: ErrorBody },
    },
    handler: async (req) => {
      const orgUser = await container.organizations.getOrgUser(req.orgId, req.userId);
      if (!orgUser) {
        throw new UnauthorizedError();
      }
      const record = await container.progress.report(req.orgId, {
        orgUserId: orgUser.id,
        activityId: req.body.activity,
        reports: req.body.reports,
      });
      return { status: record.completedAt ? ('completed' as const) : ('in-progress' as const) };
    },
  });

  r.route({
    method: 'GET',
    url: '/api/learn/courses/:courseId/progress',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'getLearnCourseProgress',
      tags: ['Progress'],
      summary: "The student's progress in one course",
      params: LearnCourseIdParam,
      response: { 200: CourseProgress, 404: ErrorBody },
    },
    handler: async (req) => {
      const orgUser = await container.organizations.getOrgUser(req.orgId, req.userId);
      if (!orgUser) {
        throw new UnauthorizedError();
      }
      const view = await learn.courseProgress(req.orgId, orgUser.id, req.params.courseId);
      if (!view) {
        throw new NotFoundError('Course', req.params.courseId);
      }
      return view;
    },
  });
}
