// Central error handler. Without this, `resolveScope` throwing `NoActiveOrgError`
// (authenticated session but no resolvable active org / domain user) surfaces as
// a 500. Map it to 403; pass through 4xx errors that already carry a status
// (validation, etc.); log and generically 500 anything unexpected.
import type { FastifyInstance } from "fastify";
import { NoActiveOrgError } from "../scope.js";
import { NotAStudentError } from "../student-scope.js";
import { UnknownPortalOrgError } from "../portal-org.js";

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof NoActiveOrgError) {
      return reply.status(403).send({ error: "forbidden", message: error.message });
    }
    if (error instanceof NotAStudentError) {
      return reply.status(403).send({ error: "forbidden", message: error.message });
    }
    if (error instanceof UnknownPortalOrgError) {
      return reply.status(400).send({ error: "bad_request", message: error.message });
    }
    const err = error as { statusCode?: number; code?: string; message?: string };
    if (typeof err.statusCode === "number" && err.statusCode >= 400 && err.statusCode < 500) {
      return reply
        .status(err.statusCode)
        .send({ error: err.code ?? "bad_request", message: err.message ?? "Bad request" });
    }
    request.log.error(error);
    return reply.status(500).send({ error: "internal_error" });
  });
}
