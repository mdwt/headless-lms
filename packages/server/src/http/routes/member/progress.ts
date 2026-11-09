import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  CourseProgress,
  MemberCourseIdParam,
  ProgressStatus,
  ReportProgress,
  refusals,
} from '../../schemas/index.js';
import type { Container } from '../../../app/container.js';
import { resolveActor } from '../../scope.js';

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
        'For a member who can open the course, through a grant or `courses:read` on it. Reports facts, never a decision: the service decides whether the activity is complete. 404 when the activity is not published, or you cannot open its course.',
      body: ReportProgress,
      response: { 200: ProgressStatus, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      const record = await container.progress.report(
        { activityId: req.body.activity, reports: req.body.reports },
        actor,
      );
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
      const actor = await resolveActor(container, req);
      return member.courseProgress(req.params.courseId, actor);
    },
  });
}
