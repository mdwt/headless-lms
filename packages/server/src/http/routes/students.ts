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
import type { Container } from '../../app/container.js';
import { resolveActor } from '../scope.js';

export async function studentsRoutes(app: FastifyInstance, container: Container): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const students = container.reporting.admin;

  r.route({
    method: 'GET',
    url: '/api/students',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'listStudents',
      tags: ['People'],
      summary: 'List students',
      description: `Requires \`people:read\`. People whose org role is Member, invited ones included, with the roles they hold on content items.`,
      querystring: StudentsQuery,
      response: { 200: StudentsPage, ...refusals(403) },
    },
    handler: async (req) => students.listStudents(req.query, await resolveActor(container, req)),
  });

  r.route({
    method: 'GET',
    url: '/api/students/:id',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'getStudent',
      tags: ['People'],
      summary: "A person's learner record",
      description: `Requires \`people:read\`. Opens for any person in the organization, whatever their roles.`,
      params: StudentIdParam,
      response: { 200: Student, ...refusals(403, 404) },
    },
    handler: async (req) => {
      return students.getStudent(req.params.id, await resolveActor(container, req));
    },
  });

  r.route({
    method: 'GET',
    url: '/api/students/:id/analytics',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'getStudentAnalytics',
      tags: ['Reporting'],
      summary: "A person's progress across courses",
      description: `Requires \`people:read\`. Per-course progress and completion.`,
      params: StudentIdParam,
      response: { 200: StudentAnalytics, ...refusals(403, 404) },
    },
    handler: async (req) => {
      return students.studentAnalytics(req.params.id, await resolveActor(container, req));
    },
  });
}
