// HTTP routes for the enrollments context.
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import {
  Enrollment,
  EnrollmentIdParam,
  EnrollmentsPage,
  EnrollmentsQuery,
  ErrorBody,
  GrantEnrollment,
  SetEnrollmentStatus,
} from "@headless-lms/api-contract";
import type { Container } from "../../composition/container.js";
import { resolveScope } from "../scope.js";

export async function enrollmentsRoutes(app: FastifyInstance, container: Container): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const enrollments = container.enrollments;

  r.route({
    method: "GET",
    url: "/api/enrollments",
    preHandler: app.requireSession,
    schema: {
      operationId: "listEnrollments",
      tags: ["Enrollments"],
      summary: "List enrollments",
      querystring: EnrollmentsQuery,
      response: { 200: EnrollmentsPage },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return enrollments.list(scope.orgId, req.query);
    },
  });

  r.route({
    method: "POST",
    url: "/api/enrollments",
    preHandler: app.requireSession,
    schema: {
      operationId: "grantEnrollment",
      tags: ["Enrollments"],
      summary: "Grant a student access to a course",
      body: GrantEnrollment,
      response: { 201: Enrollment },
    },
    handler: async (req, reply) => {
      const scope = await resolveScope(container, req);
      const enrollment = await enrollments.grant(scope.orgId, req.body);
      return reply.code(201).send(enrollment);
    },
  });

  r.route({
    method: "PATCH",
    url: "/api/enrollments/:id",
    preHandler: app.requireSession,
    schema: {
      operationId: "setEnrollmentStatus",
      tags: ["Enrollments"],
      summary: "Revoke or reinstate an enrollment",
      params: EnrollmentIdParam,
      body: SetEnrollmentStatus,
      response: { 200: Enrollment, 404: ErrorBody },
    },
    handler: async (req, reply) => {
      const scope = await resolveScope(container, req);
      const enrollment = await enrollments.setStatus(scope.orgId, req.params.id, req.body.status);
      if (!enrollment) return reply.code(404).send({ error: "not_found", message: "Enrollment not found" });
      return enrollment;
    },
  });
}
