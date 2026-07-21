// Central error handler. Without this, `resolveScope` throwing `NoActiveOrgError`
// (authenticated session but no resolvable active org / domain user) surfaces as
// a 500. Map it to 403; pass through 4xx errors that already carry a status
// (validation, etc.); log and generically 500 anything unexpected.
import type { FastifyInstance } from "fastify";
import { NoActiveOrgError } from "../scope.js";
import { NoStudentError } from "../student-scope.js";

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof NoActiveOrgError) {
      return reply.status(403).send({ error: "forbidden", message: error.message });
    }
    // A session that doesn't resolve to a portal student is an auth failure —
    // 401 so the portal bounces to login, not a generic 403.
    if (error instanceof NoStudentError) {
      return reply.status(401).send({ error: "unauthorized", message: error.message });
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
