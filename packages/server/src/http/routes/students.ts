// HTTP routes for students: the reporting-backed list/read endpoints, the
// delete, and re-issuing a pending invite. There is no create here — adding a
// student IS inviting one, at /api/organizations/invites, which provisions the
// student record up front.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  ErrorBody,
  Student,
  StudentAnalytics,
  StudentIdParam,
  StudentsPage,
  StudentsQuery,
  UpdateStudentBody,
} from '../schemas/index.js';
import { NotFoundError } from '@headless-lms/core/shared/errors';
import type { Container } from '../../app/container.js';
import { resolveScope } from '../scope.js';

export async function studentsRoutes(app: FastifyInstance, container: Container): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const students = container.reporting.admin;

  r.route({
    method: 'GET',
    url: '/api/students',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'listStudents',
      tags: ['Organizations'],
      summary: 'List students',
      querystring: StudentsQuery,
      response: { 200: StudentsPage },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return students.listStudents(scope.orgId, req.query);
    },
  });

  r.route({
    method: 'GET',
    url: '/api/students/:id',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'getStudent',
      tags: ['Organizations'],
      summary: 'Get a student by id',
      params: StudentIdParam,
      response: { 200: Student, 404: ErrorBody },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      const student = await students.getStudent(scope.orgId, req.params.id);
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
    schema: {
      operationId: 'getStudentAnalytics',
      tags: ['Reporting'],
      summary: "A student's learner record: per-course progress and completion",
      params: StudentIdParam,
      response: { 200: StudentAnalytics, 404: ErrorBody },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      const analytics = await students.studentAnalytics(scope.orgId, req.params.id);
      if (!analytics) {
        throw new NotFoundError('Student', req.params.id);
      }
      return analytics;
    },
  });

  // Corrects the person behind the student row. The write lands in identity
  // (the person is global); organizations owns the rule that this org user is
  // a student here, and reconciles their pending invite when the address moves.
  r.route({
    method: 'PATCH',
    url: '/api/students/:id',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'updateStudent',
      tags: ['Organizations'],
      summary: "Update a student's profile",
      params: StudentIdParam,
      body: UpdateStudentBody,
      response: { 200: Student, 404: ErrorBody, 409: ErrorBody },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      await container.organizations.updateStudent({
        orgId: scope.orgId,
        orgUserId: req.params.id,
        ...req.body,
      });
      // Re-read through the report so the response is the same shape the list
      // and detail GETs return, aggregates included.
      const student = await students.getStudent(scope.orgId, req.params.id);
      if (!student) {
        throw new NotFoundError('Student', req.params.id);
      }
      return student;
    },
  });

  // Re-mints the token on the student's pending invite and emails it. Lives
  // here rather than under invites because the admin app knows the student,
  // not the invitation.
  r.route({
    method: 'POST',
    url: '/api/students/:id/invite/resend',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'resendStudentInvite',
      tags: ['Organizations'],
      summary: "Re-send a pending student's invite email",
      params: StudentIdParam,
      response: { 204: z.void(), 404: ErrorBody, 409: ErrorBody },
    },
    handler: async (req, reply) => {
      const scope = await resolveScope(container, req);
      await container.organizations.resendStudentInvite({
        orgId: scope.orgId,
        orgUserId: req.params.id,
        inviterUserId: scope.userId,
      });
      return reply.code(204).send();
    },
  });

  r.route({
    method: 'DELETE',
    url: '/api/students/:id',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'deleteStudent',
      tags: ['Organizations'],
      summary: 'Delete a student',
      params: StudentIdParam,
      response: { 204: z.void(), 404: ErrorBody },
    },
    handler: async (req, reply) => {
      const scope = await resolveScope(container, req);
      await container.organizations.deleteOrgUser(scope.orgId, req.params.id);
      return reply.code(204).send();
    },
  });
}
