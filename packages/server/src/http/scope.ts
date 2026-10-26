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
    throw new NoActiveOrgError('Sign in to continue');
  }
  if (!authOrgId || !req.orgId) {
    throw new NoActiveOrgError('Choose an organization to continue');
  }
  // The session guard already translated the auth org id to the domain org.
  const org = await container.organizations.getById(req.orgId);
  if (!org) {
    throw new NoActiveOrgError('The active organization no longer exists');
  }
  const user = await container.identity.getUserByExternalId(authUser.id);
  if (!user) {
    throw new NoActiveOrgError('Your account is not set up yet');
  }
  const orgUser = await container.organizations.getOrgUser(org.id, user.id);
  if (!orgUser || !isStaffRole(orgUser.role)) {
    throw new NoActiveOrgError('Only staff of this organization can do this');
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
