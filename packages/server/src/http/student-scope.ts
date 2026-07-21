// Resolves a request's session + portal org into the org-scoped student the
// learn read layer expects. Students are org-scoped: the session user is a
// global login; the portal org (header/env, via `resolvePortalOrg`) selects the
// org, and `(orgId, externalId)` resolves the one student row. `req.authUser` is
// set by `requireSession`.
import type { FastifyRequest } from "fastify";
import type { Container } from "../composition/container.js";
import { resolvePortalOrg } from "./portal-org.js";

export interface StudentScope {
  /** Domain `students.id` for the session's user in the portal org. */
  studentId: string;
  /** The portal org's `organizations.id` the request is scoped to. */
  orgId: string;
}

/** Thrown when the session's user is not a provisioned student. Mapped to 403. */
export class NotAStudentError extends Error {}

export async function resolveStudentScope(
  container: Container,
  req: FastifyRequest,
): Promise<StudentScope> {
  const authUser = req.authUser;
  if (!authUser) throw new NotAStudentError("no authenticated user");
  const orgId = await resolvePortalOrg(container, req);
  const student = await container.identity.getStudentByExternalId(orgId, authUser.id);
  if (!student) throw new NotAStudentError("no student for the current user");
  return { studentId: student.id, orgId };
}
