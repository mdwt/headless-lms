import type { FastifyRequest } from 'fastify';
import type { Container } from '../app/container.js';
import type { Actor } from '@headless-lms/core/shared/actor';
import type { LiveSession } from '@headless-lms/core/discussion';
import type { Permission } from '@headless-lms/core/types';

export interface Caller {
  actor: Actor;
  orgId: string;
  userId: string;
  orgUserId: string;
  authOrgId: string;
  authUserId: string;
}

export class NoActiveOrgError extends Error {}

async function callerOf(
  container: Container,
  authUserId: string,
  authOrgId: string,
  tokenScopes?: readonly Permission[],
): Promise<Caller> {
  const org = await container.organizations.getByExternalId(authOrgId);
  if (!org) {
    throw new NoActiveOrgError('The active organization no longer exists');
  }
  const user = await container.identity.getUserByExternalId(authUserId);
  if (!user) {
    throw new NoActiveOrgError('Your account is not set up yet');
  }
  const orgUser = await container.organizations.getOrgUser(org.id, user.id);
  if (!orgUser) {
    throw new NoActiveOrgError('You are not a member of this organization');
  }
  container.requestContext.set({ orgId: org.id, actorOrgUserId: orgUser.id });
  const actor = await container.organizations.actorFor(org.id, orgUser.id, tokenScopes);
  if (!actor) {
    throw new NoActiveOrgError('Accept your invitation to this organization to continue');
  }
  return {
    actor,
    orgId: org.id,
    userId: user.id,
    orgUserId: orgUser.id,
    authOrgId,
    authUserId,
  };
}

export async function resolveCaller(container: Container, req: FastifyRequest): Promise<Caller> {
  const authUser = req.authUser;
  const authOrgId = req.authOrgId ?? null;
  if (!authUser) {
    throw new NoActiveOrgError('Sign in to continue');
  }
  if (!authOrgId || !req.orgId) {
    throw new NoActiveOrgError('Choose an organization to continue');
  }
  return callerOf(container, authUser.id, authOrgId);
}

export async function resolveActor(container: Container, req: FastifyRequest): Promise<Actor> {
  return (await resolveCaller(container, req)).actor;
}

/** The request's session as a live stream sees it: the cookie verified again
 *  with the session cookie cache bypassed, then the actor in the stream's org. */
export function sessionOf(container: Container, req: FastifyRequest): LiveSession {
  const headers = { ...req.headers };
  const authOrgId = req.authOrgId;
  return {
    async current() {
      const session = await container.auth.verify(headers, { bypassCookieCache: true });
      if (!session) {
        return { status: 'signed-out' };
      }
      if (!authOrgId) {
        return { status: 'no-member' };
      }
      try {
        const caller = await callerOf(container, session.user.id, authOrgId);
        return { status: 'ok', actor: caller.actor };
      } catch (error) {
        if (error instanceof NoActiveOrgError) {
          return { status: 'no-member' };
        }
        throw error;
      }
    },
  };
}

export function resolveCallerFor(
  container: Container,
  authUserId: string,
  authOrgId: string,
  tokenScopes: readonly Permission[],
): Promise<Caller> {
  return callerOf(container, authUserId, authOrgId, tokenScopes);
}
