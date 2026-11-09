import type { FastifyRequest } from 'fastify';
import type { Container } from '../app/container.js';
import type { Actor } from '@headless-lms/core/shared/actor';
import type { CallerLimit, ResolvedCaller } from '@headless-lms/core/organizations';

export interface Caller {
  actor: Actor;
  orgId: string;
  userId: string;
  orgUserId: string;
  authOrgId: string;
  authUserId: string;
}

export class NoActiveOrgError extends Error {}

function callerFrom(
  container: Container,
  resolved: ResolvedCaller | null,
  authUserId: string,
  authOrgId: string,
): Caller {
  if (!resolved) {
    throw new NoActiveOrgError('The active organization no longer exists');
  }
  if (!resolved.userId) {
    throw new NoActiveOrgError('Your account is not set up yet');
  }
  if (!resolved.orgUserId) {
    throw new NoActiveOrgError('You are not a member of this organization');
  }
  container.requestContext.set({ orgId: resolved.orgId, actorId: resolved.orgUserId });
  if (!resolved.actor) {
    throw new NoActiveOrgError('Accept your invitation to this organization to continue');
  }
  return {
    actor: resolved.actor,
    orgId: resolved.orgId,
    userId: resolved.userId,
    orgUserId: resolved.orgUserId,
    authOrgId,
    authUserId,
  };
}

export async function resolveCaller(container: Container, req: FastifyRequest): Promise<Caller> {
  const authUserId = req.authUserId;
  const authOrgId = req.authOrgId ?? null;
  if (!authUserId) {
    throw new NoActiveOrgError('Sign in to continue');
  }
  if (!authOrgId || !req.orgId) {
    throw new NoActiveOrgError('Choose an organization to continue');
  }
  const resolved =
    req.resolvedCaller ?? (await container.organizations.resolveCaller(authOrgId, authUserId));
  req.resolvedCaller = resolved ?? undefined;
  return callerFrom(container, resolved, authUserId, authOrgId);
}

export async function resolveActor(container: Container, req: FastifyRequest): Promise<Actor> {
  return (await resolveCaller(container, req)).actor;
}

export async function resolveCallerFor(
  container: Container,
  authUserId: string,
  authOrgId: string,
  limit: CallerLimit,
): Promise<Caller> {
  return callerFrom(
    container,
    await container.organizations.resolveCaller(authOrgId, authUserId, limit),
    authUserId,
    authOrgId,
  );
}
