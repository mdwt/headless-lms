// HTTP routes for the students context (read-only).
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import {
  ErrorBody,
  Student,
  StudentIdParam,
  StudentsPage,
  StudentsQuery,
} from "@headless-lms/api-contract";
import type { Container } from "../../composition/container.js";

export async function studentsRoutes(app: FastifyInstance, container: Container): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const students = container.students;

  r.route({
    method: "GET",
    url: "/api/students",
    schema: {
      operationId: "listStudents",
      tags: ["Students"],
      summary: "List students",
      querystring: StudentsQuery,
      response: { 200: StudentsPage },
    },
    handler: (req) => students.list(req.query),
  });

  r.route({
    method: "GET",
    url: "/api/students/:id",
    schema: {
      operationId: "getStudent",
      tags: ["Students"],
      summary: "Get a student by id",
      params: StudentIdParam,
      response: { 200: Student, 404: ErrorBody },
    },
    handler: async (req, reply) => {
      const student = await students.get(req.params.id);
      if (!student) return reply.code(404).send({ error: "not_found", message: "Student not found" });
      return student;
    },
  });
}
