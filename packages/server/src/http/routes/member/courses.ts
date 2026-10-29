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
import { NotFoundError } from '@headless-lms/core/shared/errors';
import type { Container } from '../../../app/container.js';
import { actorOf } from './actor.js';

export async function memberCoursesRoutes(
  app: FastifyInstance,
  container: Container,
): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const member = container.reporting.member;

  r.route({
    method: 'GET',
    url: '/api/member/courses',
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
      const orgUser = await actorOf(container, req.orgId, req.userId);
      return member.listCourses(req.orgId, orgUser.id);
    },
  });

  r.route({
    method: 'GET',
    url: '/api/member/courses/:courseId',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'getMemberCourse',
      tags: ['Content'],
      summary: 'Get one course you can open',
      description:
        'For a member of the organization. 404 when the course is not published or you do not hold it.',
      params: MemberCourseIdParam,
      response: { 200: Course, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const orgUser = await actorOf(container, req.orgId, req.userId);
      const course = await member.getCourse(req.orgId, orgUser.id, req.params.courseId);
      if (!course) {
        throw new NotFoundError('Course', req.params.courseId);
      }
      return course;
    },
  });

  r.route({
    method: 'GET',
    url: '/api/member/courses/:courseId/modules',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'listMemberModules',
      tags: ['Content'],
      summary: 'List the modules and activities of a course you can open',
      description:
        'For a member of the organization. Published activities only. 404 when the course is not published or you do not hold it.',
      params: MemberCourseIdParam,
      response: { 200: MemberModules, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const orgUser = await actorOf(container, req.orgId, req.userId);
      const modules = await member.listModules(req.orgId, orgUser.id, req.params.courseId);
      if (!modules) {
        throw new NotFoundError('Course', req.params.courseId);
      }
      return modules;
    },
  });

  r.route({
    method: 'GET',
    url: '/api/member/courses/:courseId/activities',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'listMemberActivities',
      tags: ['Content'],
      summary: 'List the published activities of a course you can open',
      description:
        'For a member of the organization. 404 when the course is not published or you do not hold it.',
      params: MemberCourseIdParam,
      response: { 200: ActivityList, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const orgUser = await actorOf(container, req.orgId, req.userId);
      const activities = await member.listActivities(req.orgId, orgUser.id, req.params.courseId);
      if (!activities) {
        throw new NotFoundError('Course', req.params.courseId);
      }
      return activities;
    },
  });
}
