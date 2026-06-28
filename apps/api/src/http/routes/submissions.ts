// HTTP routes for the submissions (grading) context.
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import {
  ErrorBody,
  GradeSubmission,
  Submission,
  SubmissionIdParam,
  SubmissionsPage,
  SubmissionsQuery,
} from "@headless-lms/api-contract";
import type { Container } from "../../composition/container.js";

export async function submissionsRoutes(app: FastifyInstance, container: Container): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const submissions = container.submissions;

  r.route({
    method: "GET",
    url: "/api/submissions",
    schema: {
      operationId: "listSubmissions",
      tags: ["Submissions"],
      summary: "List submissions in the grading queue",
      querystring: SubmissionsQuery,
      response: { 200: SubmissionsPage },
    },
    handler: (req) => submissions.list(req.query),
  });

  r.route({
    method: "PATCH",
    url: "/api/submissions/:id",
    schema: {
      operationId: "gradeSubmission",
      tags: ["Submissions"],
      summary: "Grade a submission",
      params: SubmissionIdParam,
      body: GradeSubmission,
      response: { 200: Submission, 404: ErrorBody },
    },
    handler: async (req, reply) => {
      const submission = await submissions.grade(req.params.id, req.body);
      if (!submission) return reply.code(404).send({ error: "not_found", message: "Submission not found" });
      return submission;
    },
  });
}
