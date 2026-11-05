import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  ActivityList,
  Course,
  MemberCourseIdParam,
  MemberCourses,
  MemberModules,
  refusals,
} from '../../schemas/index.js';
import type { Container } from '../../../app/container.js';
import { resolveActor } from '../../scope.js';

export async function memberCoursesRoutes(
  app: FastifyInstance,
  container: Container,
): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const member = container.reporting.member;

  r.route({
    method: 'GET',
    url: '/api/member/courses',
    config: { operation: 'reporting.member.listCourses' },
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'listMemberCourses',
      tags: ['Content'],
      summary: 'List the courses you can open',
      description:
        'For a member of the organization. Published courses you hold, directly or through a bundle.',
      response: { 200: MemberCourses, ...refusals(403) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return member.listCourses(actor);
    },
  });

  r.route({
    method: 'GET',
    url: '/api/member/courses/:courseId',
    config: { operation: 'reporting.member.getCourse' },
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'getMemberCourse',
      tags: ['Content'],
      summary: 'Get one course you can open',
      description:
        'For a member of the organization who holds the course, or holds `courses:read` on it (which also opens it unpublished). 404 otherwise.',
      params: MemberCourseIdParam,
      response: { 200: Course, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return member.getCourse(req.params.courseId, actor);
    },
  });

  r.route({
    method: 'GET',
    url: '/api/member/courses/:courseId/modules',
    config: { operation: 'reporting.member.listModules' },
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'listMemberModules',
      tags: ['Content'],
      summary: 'List the modules and activities of a course you can open',
      description:
        'For a member of the organization who holds the course, or holds `courses:read` on it. Published activities only. 404 otherwise.',
      params: MemberCourseIdParam,
      response: { 200: MemberModules, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return member.listModules(req.params.courseId, actor);
    },
  });

  r.route({
    method: 'GET',
    url: '/api/member/courses/:courseId/activities',
    config: { operation: 'reporting.member.listActivities' },
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'listMemberActivities',
      tags: ['Content'],
      summary: 'List the published activities of a course you can open',
      description:
        'For a member of the organization who holds the course, or holds `courses:read` on it. 404 otherwise.',
      params: MemberCourseIdParam,
      response: { 200: ActivityList, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return member.listActivities(req.params.courseId, actor);
    },
  });
}
