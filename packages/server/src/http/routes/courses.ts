// HTTP routes for the courses context. Request + response are validated against
// the shared contract schemas by the Zod type provider, and @fastify/swagger
// reads the same schemas to build the OpenAPI spec the SDK is generated from.
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  Course,
  CourseIdParam,
  CourseSettings,
  CoursesPage,
  CoursesQuery,
  CreateCourse,
  PatchCourseSettings,
  UpdateCourse,
  refusals,
} from '../schemas/index.js';
import { z } from 'zod';
import type { Container } from '../../app/container.js';
import { NotFoundError } from '@headless-lms/core/shared/errors';
import { resolveScope } from '../scope.js';

export async function coursesRoutes(app: FastifyInstance, container: Container): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const courses = container.content;

  r.route({
    method: 'GET',
    url: '/api/courses',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'listCourses',
      tags: ['Content'],
      summary: 'List courses (staff)',
      description:
        'Staff only (owner, admin, instructor). Every course in the organization, drafts included, filtered by status and category and searched by title.',
      querystring: CoursesQuery,
      response: { 200: CoursesPage, ...refusals(403) },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return courses.listCourses(scope.orgId, req.query);
    },
  });

  r.route({
    method: 'GET',
    url: '/api/courses/:id',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'getCourse',
      tags: ['Content'],
      summary: 'Get a course (staff)',
      description: 'Staff only (owner, admin, instructor).',
      params: CourseIdParam,
      response: { 200: Course, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      const course = await courses.getCourse(scope.orgId, req.params.id);
      if (!course) {
        throw new NotFoundError('Course', req.params.id);
      }
      return course;
    },
  });

  r.route({
    method: 'POST',
    url: '/api/courses',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'createCourse',
      tags: ['Content'],
      summary: 'Create a course (staff)',
      description:
        'Staff only (owner, admin, instructor). The course starts as a draft. 409 when its slug is taken.',
      body: CreateCourse,
      response: { 201: Course, ...refusals(403, 409) },
    },
    handler: async (req, reply) => {
      const scope = await resolveScope(container, req);
      const course = await courses.createCourse(scope.orgId, req.body);
      return reply.code(201).send(course);
    },
  });

  r.route({
    method: 'PATCH',
    url: '/api/courses/:id',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'updateCourse',
      tags: ['Content'],
      summary: 'Update a course (staff)',
      description:
        'Staff only (owner, admin, instructor). Changes only the fields sent. `thumbnailAssetId` must be a ready library image (409 otherwise); null clears it.',
      params: CourseIdParam,
      body: UpdateCourse,
      response: { 200: Course, ...refusals(403, 404, 409) },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return courses.updateCourse(scope.orgId, req.params.id, req.body);
    },
  });

  r.route({
    method: 'PATCH',
    url: '/api/courses/:id/settings',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'updateCourseSettings',
      tags: ['Content'],
      summary: "Update a course's settings (staff)",
      description:
        'Staff only (owner, admin, instructor). Merges the settings sent into the current ones.',
      params: CourseIdParam,
      body: PatchCourseSettings,
      response: { 200: CourseSettings, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      req.log.info({ body: req.body }, 'update course settings');
      return courses.patchCourseSettings(scope.orgId, req.params.id, req.body);
    },
  });

  r.route({
    method: 'DELETE',
    url: '/api/courses/:id',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'deleteCourse',
      tags: ['Content'],
      summary: 'Delete a course (staff)',
      description: 'Staff only (owner, admin, instructor).',
      params: CourseIdParam,
      response: { 204: z.void(), ...refusals(403, 404) },
    },
    handler: async (req, reply) => {
      const scope = await resolveScope(container, req);
      await courses.deleteCourse(scope.orgId, req.params.id, {
        id: scope.orgUserId,
        role: scope.role,
      });
      return reply.code(204).send();
    },
  });
}
