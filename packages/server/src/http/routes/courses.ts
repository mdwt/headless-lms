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
import { resolveActor } from '../scope.js';

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
      summary: 'List courses',
      description: `Requires \`courses:read\`. Every course in the organization, drafts included, filtered by status and category and searched by title.`,
      querystring: CoursesQuery,
      response: { 200: CoursesPage, ...refusals(403) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return courses.listCourses(req.query, actor);
    },
  });

  r.route({
    method: 'GET',
    url: '/api/courses/:id',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'getCourse',
      tags: ['Content'],
      summary: 'Get a course',
      description: 'Requires `courses:read`.',
      params: CourseIdParam,
      response: { 200: Course, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return courses.getCourse(req.params.id, actor);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/courses',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'createCourse',
      tags: ['Content'],
      summary: 'Create a course',
      description: `Requires \`courses:write\`. The course starts as a draft. 409 when its slug is taken.`,
      body: CreateCourse,
      response: { 201: Course, ...refusals(403, 409) },
    },
    handler: async (req, reply) => {
      const actor = await resolveActor(container, req);
      const course = await courses.createCourse(req.body, actor);
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
      summary: 'Update a course',
      description: `Requires \`courses:write\`. Changes only the fields sent. \`thumbnailAssetId\` must be a ready library image (409 otherwise); null clears it. A file it does not already use must be uploaded for it, or the caller needs \`media:read\` (403 otherwise).`,
      params: CourseIdParam,
      body: UpdateCourse,
      response: { 200: Course, ...refusals(403, 404, 409) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return courses.updateCourse(req.params.id, req.body, actor);
    },
  });

  r.route({
    method: 'PATCH',
    url: '/api/courses/:id/settings',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'updateCourseSettings',
      tags: ['Content'],
      summary: "Update a course's settings",
      description: `Requires \`courses:write\`. Merges the settings sent into the current ones.`,
      params: CourseIdParam,
      body: PatchCourseSettings,
      response: { 200: CourseSettings, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return courses.patchCourseSettings(req.params.id, req.body, actor);
    },
  });

  r.route({
    method: 'DELETE',
    url: '/api/courses/:id',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'deleteCourse',
      tags: ['Content'],
      summary: 'Delete a course',
      description: 'Requires `courses:delete`.',
      params: CourseIdParam,
      response: { 204: z.void(), ...refusals(403, 404) },
    },
    handler: async (req, reply) => {
      const actor = await resolveActor(container, req);
      await courses.deleteCourse(req.params.id, actor);
      return reply.code(204).send();
    },
  });
}
