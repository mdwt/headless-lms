// Translates a better-auth OAuthAccessToken into the McpPrincipal used by the
// authz layer. Performs minimal I/O: one identity lookup + one membership lookup.
import type { OAuthAccessToken } from "better-auth/plugins";
import type { Container } from "../../composition/container.js";
import { parseRole } from "../../core/organizations/index.js";
import type { McpPrincipal } from "./authz.js";

export class PrincipalError extends Error {
  constructor(
    message: string,
    readonly status: 401 | 403,
  ) {
    super(message);
    this.name = "PrincipalError";
  }
}

/**
 * Resolves a verified OAuth access token into a domain McpPrincipal.
 *
 * Throws PrincipalError (401) when no domain student maps to the auth user,
 * and PrincipalError (403) when the student has no org membership.
 */
export async function buildPrincipal(
  token: OAuthAccessToken,
  container: Container,
): Promise<McpPrincipal> {
  const student = await container.identity.getStudentByAuthUserId(token.userId);
  if (!student) {
    throw new PrincipalError("no domain student for auth user", 401);
  }

  const membership = await container.organizations.getMembershipByStudent(student.id);
  if (!membership) {
    throw new PrincipalError("user has no org membership", 403);
  }

  const assignedCourseIds = await container.organizations.assignedCourseIds(
    membership.orgId,
    membership.id,
  );

  // OAuthAccessToken.scopes is a space-separated string per OAuth 2.0 convention.
  const scopes = token.scopes.split(" ").filter(Boolean);

  return {
    studentId: student.id,
    orgId: membership.orgId,
    role: parseRole(membership.role),
    assignedCourseIds,
    scopes,
  };
}
