// HTTP routes for students: the reporting-backed list/read endpoints, the
// delete, and re-issuing a pending invite. There is no create here — adding a
// student IS inviting one, at /api/organizations/invites, which provisions the
// student record up front.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  Student,
  StudentAnalytics,
  StudentIdParam,
  StudentsPage,
  StudentsQuery,
  UpdateStudentBody,
  refusals,
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
      summary: 'List students (staff)',
      description: 'Staff only (owner, admin, instructor).',
      querystring: StudentsQuery,
      response: { 200: StudentsPage, ...refusals(403) },
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
      summary: 'Get a student (staff)',
      description: 'Staff only (owner, admin, instructor).',
      params: StudentIdParam,
      response: { 200: Student, ...refusals(403, 404) },
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
      summary: "A student's learner record (staff)",
      description: 'Staff only (owner, admin, instructor). Per-course progress and completion.',
      params: StudentIdParam,
      response: { 200: StudentAnalytics, ...refusals(403, 404) },
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
      summary: "Update a student's profile (staff)",
      description:
        "Staff only (owner, admin, instructor). Corrects the person's name or email; a pending invite follows a new email. 409 when the email belongs to someone else.",
      params: StudentIdParam,
      body: UpdateStudentBody,
      response: { 200: Student, ...refusals(403, 404, 409) },
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
      summary: "Re-send a pending student's invite email (staff)",
      description:
        'Owner or admin only. Issues a new token, so the previous link stops working. 404 when the student has no pending invite; 409 when it was already accepted.',
      params: StudentIdParam,
      response: { 204: z.void(), ...refusals(403, 404, 409) },
    },
    handler: async (req, reply) => {
      const scope = await resolveScope(container, req);
      await container.organizations.resendStudentInvite(
        { id: scope.orgUserId, role: scope.role },
        {
          orgId: scope.orgId,
          orgUserId: req.params.id,
          inviterUserId: scope.userId,
        },
      );
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
      summary: 'Delete a student (staff)',
      description:
        'Owner or admin only. 409 when the person has written posts, comments or messages.',
      params: StudentIdParam,
      response: { 204: z.void(), ...refusals(403, 404, 409) },
    },
    handler: async (req, reply) => {
      const scope = await resolveScope(container, req);
      await container.organizations.deleteOrgUser(
        scope.orgId,
        { id: scope.orgUserId, role: scope.role },
        req.params.id,
      );
      return reply.code(204).send();
    },
  });
}
