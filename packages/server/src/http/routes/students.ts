// HTTP routes for students: the reporting-backed list/read endpoints, plus
// identity-backed writes (manual creation, invite resend).
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { fromNodeHeaders } from 'better-auth/node';
import {
  CreateStudent,
  ErrorBody,
  Student,
  StudentIdParam,
  StudentsPage,
  StudentsQuery,
} from '@headless-lms/api-contract';
import { ConflictError, NotFoundError } from '../../core/shared/errors.js';
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
      summary: 'Create a student manually',
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
      if (req.body.sendInvite) {
        // Mint the better-invite invitation as the acting admin; the plugin's
        // afterCreateInvite hook records the invite id on the student row and
        // sendUserInvitation emails the portal welcome link.
        await container.auth.api.createInvite({
          body: { email: created.email, role: 'student' },
          headers: fromNodeHeaders(req.headers),
        });
      }
      const student = await students.get(scope.orgId, created.id);
      if (!student) {
        throw new NotFoundError('Student', created.id);
      }
      return reply.code(201).send(student);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/students/:id/invite',
    preHandler: app.requireSession,
    schema: {
      operationId: 'resendStudentInvite',
      tags: ['Students'],
      summary: 'Resend the portal invitation for a pending student',
      params: StudentIdParam,
      response: { 204: z.void(), 404: ErrorBody, 409: ErrorBody },
    },
    handler: async (req, reply) => {
      const scope = await resolveScope(container, req);
      const student = await container.identity.getStudentById(scope.orgId, req.params.id);
      if (!student) {
        throw new NotFoundError('Student', req.params.id);
      }
      if (student.externalId !== null) {
        throw new ConflictError('This student already has an account');
      }
      await container.auth.api.createInvite({
        body: { email: student.email, role: 'student' },
        headers: fromNodeHeaders(req.headers),
      });
      return reply.code(204).send();
    },
  });
}
