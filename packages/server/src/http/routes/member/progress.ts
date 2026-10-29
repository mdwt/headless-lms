import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  CourseProgress,
  MemberCourseIdParam,
  ProgressStatus,
  ReportProgress,
  refusals,
} from '../../schemas/index.js';
import { NotFoundError } from '@headless-lms/core/shared/errors';
import type { Container } from '../../../app/container.js';
import { actorOf } from './actor.js';

export async function memberProgressRoutes(
  app: FastifyInstance,
  container: Container,
): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const member = container.reporting.member;

  r.route({
    method: 'POST',
    url: '/api/member/progress',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'reportProgress',
      tags: ['Progress'],
      summary: 'Report usage on an activity; the progress service decides completion',
      description:
        'For a member who can open the course. Reports facts, never a decision: the service decides whether the activity is complete. 404 when the activity or its course is not published, or you cannot open it.',
      body: ReportProgress,
      response: { 200: ProgressStatus, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const orgUser = await actorOf(container, req.orgId, req.userId);
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
    url: '/api/member/courses/:courseId/progress',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'getMemberCourseProgress',
      tags: ['Progress'],
      summary: 'Your progress in one course',
      description:
        "For a member of the organization, derived from the course's current structure. 404 when the course is not published or you do not hold it.",
      params: MemberCourseIdParam,
      response: { 200: CourseProgress, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const orgUser = await actorOf(container, req.orgId, req.userId);
      const view = await member.courseProgress(req.orgId, orgUser.id, req.params.courseId);
      if (!view) {
        throw new NotFoundError('Course', req.params.courseId);
      }
      return view;
    },
  });
}
