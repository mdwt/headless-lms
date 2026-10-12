import type { FastifyRequest } from 'fastify';
import type { Container } from '../app/container.js';
import { isStaffRole, type StaffRole } from '@headless-lms/core/organizations';

export interface OrgScope {
  /** Domain `organizations.id` for the session's active org. */
  orgId: string;
  /** Domain `users.id` of the acting person. */
  userId: string;
  /** Domain `org_users.id` — the acting org user in this org. */
  orgUserId: string;
  /** The role held in this org. */
  role: StaffRole;
  /** Better-auth organization id (for writes that go through the auth provider). */
  authOrgId: string;
}

/** Thrown when the session has no resolvable active org / domain user. */
export class NoActiveOrgError extends Error {}

export async function resolveScope(container: Container, req: FastifyRequest): Promise<OrgScope> {
  const authUser = req.authUser;
  const authOrgId = req.authOrgId ?? null;
  if (!authUser) {
    throw new NoActiveOrgError('no authenticated user');
  }
  if (!authOrgId || !req.orgId) {
    throw new NoActiveOrgError('no active organization in session');
  }
  // The session guard already translated the auth org id to the domain org.
  const org = await container.organizations.getById(req.orgId);
  if (!org) {
    throw new NoActiveOrgError('active organization not found');
  }
  const user = await container.identity.getUserByExternalId(authUser.id);
  if (!user) {
    throw new NoActiveOrgError('no domain user for the current user');
  }
  const orgUser = await container.organizations.getOrgUser(org.id, user.id);
  if (!orgUser || !isStaffRole(orgUser.role)) {
    throw new NoActiveOrgError('not a staff member of the active organization');
  }
  container.requestContext.set({ orgId: org.id });
  return {
    orgId: org.id,
    userId: user.id,
    orgUserId: orgUser.id,
    role: orgUser.role,
    authOrgId,
  };
}

export async function resolveScopeFor(
  container: Container,
  authUserId: string,
  authOrgId: string,
): Promise<OrgScope> {
  const org = await container.organizations.getByExternalId(authOrgId);
  if (!org) {
    throw new NoActiveOrgError('active organization not found');
  }
  const user = await container.identity.getUserByExternalId(authUserId);
  if (!user) {
    throw new NoActiveOrgError('no domain user for the current user');
  }
  const orgUser = await container.organizations.getOrgUser(org.id, user.id);
  if (!orgUser || !isStaffRole(orgUser.role)) {
    throw new NoActiveOrgError('not a staff member of the active organization');
  }
  container.requestContext.set({ orgId: org.id });
  return { orgId: org.id, userId: user.id, orgUserId: orgUser.id, role: orgUser.role, authOrgId };
}
