// HTTP routes for students: the reporting-backed list/read endpoints, plus
// identity-backed writes (manual creation). Invites live at /api/organizations/invites.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  CreateStudent,
  ErrorBody,
  Student,
  StudentIdParam,
  StudentsPage,
  StudentsQuery,
} from '@headless-lms/api-contract';
import { NotFoundError } from '../../core/shared/errors.js';
import type { Container } from '../../app/container.js';
import { resolveScope } from '../scope.js';

export async function studentsRoutes(app: FastifyInstance, container: Container): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const students = container.reporting.students;

  r.route({
    method: 'GET',
    url: '/api/students',
    preHandler: app.requireSession,
    schema: {
      operationId: 'listStudents',
      tags: ['Students'],
      summary: 'List students',
      querystring: StudentsQuery,
      response: { 200: StudentsPage },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return students.list(scope.orgId, req.query);
    },
  });

  r.route({
    method: 'GET',
    url: '/api/students/:id',
    preHandler: app.requireSession,
    schema: {
      operationId: 'getStudent',
      tags: ['Students'],
      summary: 'Get a student by id',
      params: StudentIdParam,
      response: { 200: Student, 404: ErrorBody },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      const student = await students.get(scope.orgId, req.params.id);
      if (!student) {
        throw new NotFoundError('Student', req.params.id);
      }
      return student;
    },
  });

  r.route({
    method: 'POST',
    url: '/api/students',
    preHandler: app.requireSession,
    schema: {
      operationId: 'createStudent',
      tags: ['Students'],
      summary: 'Create a student from the admin portal',
      body: CreateStudent,
      response: { 201: Student, 409: ErrorBody },
    },
    handler: async (req, reply) => {
      const scope = await resolveScope(container, req);
      const created = await container.identity.createStudent({
        orgId: scope.orgId,
        email: req.body.email,
        firstName: req.body.firstName,
        lastName: req.body.lastName,
      });
      const student = await students.get(scope.orgId, created.id);
      if (!student) {
        throw new Error('created student missing from report');
      }
      return reply.code(201).send(student);
    },
  });

  r.route({
    method: 'DELETE',
    url: '/api/students/:id',
    preHandler: app.requireSession,
    schema: {
      operationId: 'deleteStudent',
      tags: ['Students'],
      summary: 'Delete a student',
      params: StudentIdParam,
      response: { 204: z.void(), 404: ErrorBody },
    },
    handler: async (req, reply) => {
      const scope = await resolveScope(container, req);
      await container.identity.deleteStudent(scope.orgId, req.params.id);
      return reply.code(204).send();
    },
  });
}
