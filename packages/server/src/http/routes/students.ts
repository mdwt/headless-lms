import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  Student,
  StudentAnalytics,
  StudentIdParam,
  StudentsPage,
  StudentsQuery,
  refusals,
} from '../schemas/index.js';
import { NotFoundError } from '@headless-lms/core/shared/errors';
import type { Container } from '../../app/container.js';
import { resolveActor } from '../scope.js';
import { describeOperation } from '../operations.js';

export async function studentsRoutes(app: FastifyInstance, container: Container): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const students = container.reporting.admin;

  r.route({
    method: 'GET',
    url: '/api/students',
    preHandler: app.requireOrgSession,
    config: { operation: 'reporting.admin.listStudents' },
    schema: {
      operationId: 'listStudents',
      tags: ['People'],
      summary: 'List students',
      description: `${describeOperation('reporting.admin.listStudents')} People whose org role is Member, invited ones included, with the roles they hold on content items.`,
      querystring: StudentsQuery,
      response: { 200: StudentsPage, ...refusals(403) },
    },
    handler: async (req) => students.listStudents(req.query, await resolveActor(container, req)),
  });

  r.route({
    method: 'GET',
    url: '/api/students/:id',
    preHandler: app.requireOrgSession,
    config: { operation: 'reporting.admin.getStudent' },
    schema: {
      operationId: 'getStudent',
      tags: ['People'],
      summary: "A person's learner record",
      description: `${describeOperation('reporting.admin.getStudent')} Opens for any person in the organization, whatever their roles.`,
      params: StudentIdParam,
      response: { 200: Student, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const student = await students.getStudent(req.params.id, await resolveActor(container, req));
      if (!student) {
        throw new NotFoundError('Student', req.params.id);
      }
      return student;
    },
  });

  r.route({
    method: 'GET',
    url: '/api/students/:id/analytics',
    preHandler: app.requireOrgSession,
    config: { operation: 'reporting.admin.studentAnalytics' },
    schema: {
      operationId: 'getStudentAnalytics',
      tags: ['Reporting'],
      summary: "A person's progress across courses",
      description: `${describeOperation('reporting.admin.studentAnalytics')} Per-course progress and completion.`,
      params: StudentIdParam,
      response: { 200: StudentAnalytics, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const analytics = await students.studentAnalytics(
        req.params.id,
        await resolveActor(container, req),
      );
      if (!analytics) {
        throw new NotFoundError('Student', req.params.id);
      }
      return analytics;
    },
  });
}
