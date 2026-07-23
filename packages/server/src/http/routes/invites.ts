// HTTP routes for domain-owned invites.
//
// Two registration surfaces: `invitesRoutes` (session-guarded: create, accept)
// and `invitesPublicRoutes` (activate — the invitee has no session yet). The
// activation cookie stages the token on the API host so the better-auth signup
// gate can validate it; headers/cookies live and die in these handlers.
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { fromNodeHeaders } from 'better-auth/node';
import {
  AcceptInvite,
  AcceptInviteResult,
  ActivateInvite,
  ActivateInviteResult,
  CreateInvite,
  ErrorBody,
  Invitation,
} from '@headless-lms/api-contract';
import { INVITE_COOKIE_NAME } from '../../core/shared/invite-token.js';
import type { Container } from '../../app/container.js';
import { resolveScope } from '../scope.js';

const INVITE_COOKIE_MAX_AGE = 600;

function setInviteCookie(reply: FastifyReply, token: string, secure: boolean): void {
  const attrs = [
    `${INVITE_COOKIE_NAME}=${encodeURIComponent(token)}`,
    `Max-Age=${INVITE_COOKIE_MAX_AGE}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (secure) {
    attrs.push('Secure');
  }
  reply.header('set-cookie', attrs.join('; '));
}

async function acceptForSession(
  container: Container,
  req: FastifyRequest,
  token: string,
): Promise<boolean> {
  const session = await container.auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  if (!session) {
    return false;
  }
  const accepted = await container.organizations.acceptInvite({
    token,
    userExternalId: session.user.id,
    email: session.user.email,
  });
  if (!accepted) {
    return false;
  }
  await container.stampSessionActiveOrg(req.headers, accepted.orgExternalId);
  return true;
}

export async function invitesRoutes(app: FastifyInstance, container: Container): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.route({
    method: 'POST',
    url: '/api/organizations/invites',
    preHandler: app.requireSession,
    schema: {
      operationId: 'createInvite',
      tags: ['Invites'],
      summary: 'Invite a member or student into the active organization',
      body: CreateInvite,
      response: { 201: Invitation, 409: ErrorBody },
    },
    handler: async (req, reply) => {
      const scope = await resolveScope(container, req);
      const invitation = await container.organizations.createInvite({
        orgId: scope.orgId,
        inviterUserId: scope.userId,
        email: req.body.email,
        role: req.body.role,
      });
      return reply.code(201).send({
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        status: invitation.status,
        expiresAt: invitation.expiresAt?.toISOString() ?? null,
        createdAt: invitation.createdAt.toISOString(),
      });
    },
  });

  r.route({
    method: 'POST',
    url: '/api/invites/accept',
    preHandler: app.requireSession,
    schema: {
      operationId: 'acceptInvite',
      tags: ['Invites'],
      summary: 'Accept an invitation with the logged-in account',
      body: AcceptInvite,
      response: { 200: AcceptInviteResult, 400: ErrorBody },
    },
    handler: async (req, reply) => {
      const accepted = await acceptForSession(container, req, req.body.token);
      if (!accepted) {
        return reply
          .code(400)
          .send({ error: 'This invitation link is invalid or has expired.' });
      }
      return reply.send({ status: 'accepted' as const });
    },
  });
}

export async function invitesPublicRoutes(
  app: FastifyInstance,
  container: Container,
  opts: { secureCookies: boolean },
): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.route({
    method: 'POST',
    url: '/api/invites/activate',
    schema: {
      operationId: 'activateInvite',
      tags: ['Invites'],
      summary: 'Validate an invite token and stage it for signup',
      body: ActivateInvite,
      response: { 200: ActivateInviteResult, 400: ErrorBody },
    },
    handler: async (req, reply) => {
      const invitation = await container.organizations.peekInvite(req.body.token);
      if (!invitation) {
        return reply
          .code(400)
          .send({ error: 'This invitation link is invalid or has expired.' });
      }
      if (await acceptForSession(container, req, req.body.token)) {
        return reply.send({
          status: 'accepted' as const,
          email: invitation.email,
          role: invitation.role,
        });
      }
      setInviteCookie(reply, req.body.token, opts.secureCookies);
      return reply.send({
        status: 'auth-required' as const,
        email: invitation.email,
        role: invitation.role,
      });
    },
  });
}
