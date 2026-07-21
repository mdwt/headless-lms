// HTTP routes for the student-facing Learn surface (read-only; served by the
// reporting layer). Session-guarded like every back-office route, but scoped by
// the student's enrollments via `resolveStudentScope` — never by org.
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import {
  Course,
  ErrorBody,
  LearnCourseIdParam,
  LearnCourses,
  LearnModules,
  LearnOrg,
} from "@headless-lms/api-contract";
import type { Container } from "../../composition/container.js";
import { resolveStudentScope } from "../student-scope.js";

export async function learnRoutes(app: FastifyInstance, container: Container): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const learn = container.reporting.learn;

  r.route({
    method: "GET",
    url: "/api/learn/courses",
    preHandler: app.requireSession,
    schema: {
      operationId: "listLearnCourses",
      tags: ["Learn"],
      summary: "List the student's enrolled courses",
      response: { 200: LearnCourses },
    },
    handler: async (req) => {
      const scope = await resolveStudentScope(container, req);
      return learn.listCourses(scope.orgId, scope.studentId);
    },
  });

  r.route({
    method: "GET",
    url: "/api/learn/org",
    preHandler: app.requireSession,
    schema: {
      operationId: "getLearnOrg",
      tags: ["Learn"],
      summary: "Get the portal org's public identity (branding)",
      response: { 200: LearnOrg },
    },
    handler: async (req) => {
      // The session's student + org (from `activeOrganizationId`) — surface the
      // org's display identity for the portal brand.
      const { org } = await resolveStudentScope(container, req);
      return { id: org.id, name: org.name, slug: org.slug };
    },
  });

  r.route({
    method: "GET",
    url: "/api/learn/courses/:courseId",
    preHandler: app.requireSession,
    schema: {
      operationId: "getLearnCourse",
      tags: ["Learn"],
      summary: "Get one enrolled course",
      params: LearnCourseIdParam,
      response: { 200: Course, 404: ErrorBody },
    },
    handler: async (req, reply) => {
      const scope = await resolveStudentScope(container, req);
      const course = await learn.getCourse(scope.orgId, scope.studentId, req.params.courseId);
      if (!course)
        return reply.code(404).send({ error: "not_found", message: "Course not found" });
      return course;
    },
  });

  r.route({
    method: "GET",
    url: "/api/learn/courses/:courseId/modules",
    preHandler: app.requireSession,
    schema: {
      operationId: "listLearnModules",
      tags: ["Learn"],
      summary: "List an enrolled course's module/activity tree",
      params: LearnCourseIdParam,
      response: { 200: LearnModules, 404: ErrorBody },
    },
    handler: async (req, reply) => {
      const scope = await resolveStudentScope(container, req);
      const modules = await learn.listModules(scope.orgId, scope.studentId, req.params.courseId);
      if (!modules)
        return reply.code(404).send({ error: "not_found", message: "Course not found" });
      return modules;
    },
  });
}
