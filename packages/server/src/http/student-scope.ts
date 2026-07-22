// Resolves a request's session into the org-scoped student the learn read layer
// expects. Students are org-scoped: the org rides in the session (better-auth
// `activeOrganizationId`, stamped at login and exposed as `req.orgId` by
// `requireSession`) — no per-request header. `(orgId, externalId)` resolves the
// one student row. A session that doesn't resolve to a portal student is an
// authentication failure (→ 401).
import type { FastifyRequest } from 'fastify';
import type { Container } from '../app/container.js';
import type { Organization } from '../core/organizations/index.js';

export interface StudentScope {
  /** Domain `students.id` for the session's user in the portal org. */
  studentId: string;
  /** The portal org's `organizations.id` the request is scoped to. */
  orgId: string;
  /** The portal org record (for branding surfaces). */
  org: Organization;
}

/** Thrown when the session doesn't resolve to a portal student. An auth failure → 401. */
export class NoStudentError extends Error {}

export async function resolveStudentScope(
  container: Container,
  req: FastifyRequest,
): Promise<StudentScope> {
  const authUser = req.authUser;
  const authOrgId = req.orgId ?? null;
  if (!authUser || !authOrgId) {
    throw new NoStudentError('no authenticated student session');
  }
  const org = await container.organizations.getByExternalId(authOrgId);
  if (!org) {
    throw new NoStudentError('session organization not found');
  }
  const student = await container.identity.getStudentByExternalId(org.id, authUser.id);
  if (!student) {
    throw new NoStudentError('no student for the current session');
  }
  return { studentId: student.id, orgId: org.id, org };
}
