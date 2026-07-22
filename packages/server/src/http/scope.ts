// Resolves a request's session into the domain ids the org-scoped back-office
// services expect. `req.orgId` is the better-auth active-organization id and
// `req.authUser` the better-auth user — both set by the `requireSession`
// preHandler. Back-office routes run `requireSession` then `resolveScope`.
import type { FastifyRequest } from 'fastify';
import type { Container } from '../app/container.js';

export interface OrgScope {
  /** Domain `organizations.id` (uuid) for the session's active org. */
  orgId: string;
  /** Domain `users.id` (uuid) of the acting staff user. */
  userId: string;
  /** Better-auth organization id (for writes that go through the auth provider). */
  authOrgId: string;
}

/** Thrown when the session has no resolvable active org / domain user. */
export class NoActiveOrgError extends Error {}

export async function resolveScope(container: Container, req: FastifyRequest): Promise<OrgScope> {
  const authUser = req.authUser;
  const authOrgId = req.orgId ?? null;
  if (!authUser) {
    throw new NoActiveOrgError('no authenticated user');
  }
  if (!authOrgId) {
    throw new NoActiveOrgError('no active organization in session');
  }
  const org = await container.organizations.getByExternalId(authOrgId);
  if (!org) {
    throw new NoActiveOrgError('active organization not found');
  }
  const user = await container.identity.getUserByExternalId(authUser.id);
  if (!user) {
    throw new NoActiveOrgError('no domain user for the current user');
  }
  return { orgId: org.id, userId: user.id, authOrgId };
}
