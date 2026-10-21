import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  ActivityList,
  Course,
  ErrorBody,
  MemberCourseIdParam,
  MemberCourses,
  MemberModules,
} from '../../schemas/index.js';
import { NotFoundError } from '@headless-lms/core/shared/errors';
import type { Container } from '../../../app/container.js';
import { UnauthorizedError } from '../../plugins/auth.js';

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
      summary: "List the student's enrolled courses",
      response: { 200: MemberCourses },
    },
    handler: async (req) => {
      const orgUser = await container.organizations.getOrgUser(req.orgId, req.userId);
      if (!orgUser) {
        throw new UnauthorizedError();
      }
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
      summary: 'Get one enrolled course',
      params: MemberCourseIdParam,
      response: { 200: Course, 404: ErrorBody },
    },
    handler: async (req) => {
      const orgUser = await container.organizations.getOrgUser(req.orgId, req.userId);
      if (!orgUser) {
        throw new UnauthorizedError();
      }
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
      summary: "List an enrolled course's module/activity tree",
      params: MemberCourseIdParam,
      response: { 200: MemberModules, 404: ErrorBody },
    },
    handler: async (req) => {
      const orgUser = await container.organizations.getOrgUser(req.orgId, req.userId);
      if (!orgUser) {
        throw new UnauthorizedError();
      }
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
      summary: "List an enrolled course's published activities",
      params: MemberCourseIdParam,
      response: { 200: ActivityList, 404: ErrorBody },
    },
    handler: async (req) => {
      const orgUser = await container.organizations.getOrgUser(req.orgId, req.userId);
      if (!orgUser) {
        throw new UnauthorizedError();
      }
      const activities = await member.listActivities(req.orgId, orgUser.id, req.params.courseId);
      if (!activities) {
        throw new NotFoundError('Course', req.params.courseId);
      }
      return activities;
    },
  });
}
