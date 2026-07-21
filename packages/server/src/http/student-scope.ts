// Resolves a request's session into the domain student id the learn read layer
// expects. Unlike `resolveScope`, it requires NO active org — a student is a
// global identity, not an org member. `req.authUser` is set by `requireSession`.
import type { FastifyRequest } from "fastify";
import type { Container } from "../composition/container.js";

export interface StudentScope {
  /** Domain `students.id` for the session's user. */
  studentId: string;
}

/** Thrown when the session's user is not a provisioned student. Mapped to 403. */
export class NotAStudentError extends Error {}

export async function resolveStudentScope(
  container: Container,
  req: FastifyRequest,
): Promise<StudentScope> {
  const authUser = req.authUser;
  if (!authUser) throw new NotAStudentError("no authenticated user");
  const student = await container.identity.getStudentByExternalId(authUser.id);
  if (!student) throw new NotAStudentError("no student for the current user");
  return { studentId: student.id };
}
