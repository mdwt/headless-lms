// HTTP routes for the courses context. Request + response are validated against
// the shared contract schemas by the Zod type provider, and @fastify/swagger
// reads the same schemas to build the OpenAPI spec the SDK is generated from.
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import {
  Course,
  CourseIdParam,
  CoursesPage,
  CoursesQuery,
  CreateCourse,
  ErrorBody,
  UpdateCourse,
} from "@headless-lms/api-contract";
import { z } from "zod";
import type { Container } from "../../composition/container.js";
import { resolveScope } from "../scope.js";

export async function coursesRoutes(app: FastifyInstance, container: Container): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const courses = container.courses;

  r.route({
    method: "GET",
    url: "/api/courses",
    preHandler: app.requireSession,
    schema: {
      operationId: "listCourses",
      tags: ["Courses"],
      summary: "List courses",
      querystring: CoursesQuery,
      response: { 200: CoursesPage },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return courses.list(scope.orgId, req.query);
    },
  });

  r.route({
    method: "GET",
    url: "/api/courses/:id",
    preHandler: app.requireSession,
    schema: {
      operationId: "getCourse",
      tags: ["Courses"],
      summary: "Get a course by id",
      params: CourseIdParam,
      response: { 200: Course, 404: ErrorBody },
    },
    handler: async (req, reply) => {
      const scope = await resolveScope(container, req);
      const course = await courses.get(scope.orgId, req.params.id);
      if (!course) return reply.code(404).send({ error: "not_found", message: "Course not found" });
      return course;
    },
  });

  r.route({
    method: "POST",
    url: "/api/courses",
    preHandler: app.requireSession,
    schema: {
      operationId: "createCourse",
      tags: ["Courses"],
      summary: "Create a course",
      body: CreateCourse,
      response: { 201: Course },
    },
    handler: async (req, reply) => {
      const scope = await resolveScope(container, req);
      const course = await courses.create(scope.orgId, req.body);
      return reply.code(201).send(course);
    },
  });

  r.route({
    method: "PATCH",
    url: "/api/courses/:id",
    preHandler: app.requireSession,
    schema: {
      operationId: "updateCourse",
      tags: ["Courses"],
      summary: "Update a course",
      params: CourseIdParam,
      body: UpdateCourse,
      response: { 200: Course, 404: ErrorBody },
    },
    handler: async (req, reply) => {
      const scope = await resolveScope(container, req);
      const course = await courses.update(scope.orgId, req.params.id, req.body);
      if (!course) return reply.code(404).send({ error: "not_found", message: "Course not found" });
      return course;
    },
  });

  r.route({
    method: "DELETE",
    url: "/api/courses/:id",
    preHandler: app.requireSession,
    schema: {
      operationId: "deleteCourse",
      tags: ["Courses"],
      summary: "Delete a course",
      params: CourseIdParam,
      response: { 204: z.void(), 404: ErrorBody },
    },
    handler: async (req, reply) => {
      const scope = await resolveScope(container, req);
      const removed = await courses.remove(scope.orgId, req.params.id);
      if (!removed) return reply.code(404).send({ error: "not_found", message: "Course not found" });
      return reply.code(204).send();
    },
  });
}
