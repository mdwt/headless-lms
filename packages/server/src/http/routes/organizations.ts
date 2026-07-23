// HTTP routes for the organizations resource: creating an org, managing its
// members (/api/organizations/members) and its invites
// (/api/organizations/invites — mint, activate, accept). Member reads come
// from the domain mirror; org/member writes go through Better Auth (the org
// provider). Invite activation is the one route an invitee reaches without a
// session, exported separately (`organizationsPublicRoutes`) so it registers
// outside the session guard; the activation cookie lives and dies here.
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { fromNodeHeaders } from 'better-auth/node';
import {
  AcceptInvite,
  AcceptInviteResult,
  ActivateInvite,
  ActivateInviteResult,
  CreateInvite,
  CreateOrganization,
  ErrorBody,
  Invitation,
  Member,
  MemberIdParam,
  MembersPage,
  MembersQuery,
  Organization,
  UpdateMemberRole,
  UpdateOrganization,
} from '@headless-lms/api-contract';
import type { MemberWriteContext } from '../../core/organizations/index.js';
import { INVITE_COOKIE_NAME } from '../../core/shared/invite-token.js';
import { NotFoundError } from '../../core/shared/errors.js';
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

export async function organizationsRoutes(
  app: FastifyInstance,
  container: Container,
): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const organizations = container.organizations;
  const tags = ['Organizations'];

  // Create a new organization on the caller's behalf and make it their active
  // org. This is the API's own front door for org creation — it drives Better
  // Auth internally, so callers use the typed SDK, not the auth namespace. No
  // resolveScope here: the caller has no active org yet, only a session.
  r.route({
    method: 'POST',
    url: '/api/organizations',
    preHandler: app.requireSession,
    schema: {
      operationId: 'createOrganization',
      tags,
      summary: 'Create an organization and make it active',
      body: CreateOrganization,
      response: { 201: Organization },
    },
    handler: async (req, reply) => {
      const org = await organizations.createOrganization(req.headers, req.body);
      return reply.code(201).send({
        id: org.id,
        name: org.name,
        slug: org.slug,
        createdAt: org.createdAt.toISOString(),
      });
    },
  });

  // Update the caller's active organization (name/slug). Writes go through Better
  // Auth, which enforces the caller's org-update permission (owner/admin).
  r.route({
    method: 'PATCH',
    url: '/api/organizations',
    preHandler: app.requireSession,
    schema: {
      operationId: 'updateOrganization',
      tags,
      summary: 'Update the active organization',
      body: UpdateOrganization,
      response: { 200: Organization, 409: ErrorBody },
    },
    handler: async (req, reply) => {
      const scope = await resolveScope(container, req);
      const org = await organizations.updateOrganization(req.headers, scope.authOrgId, req.body);
      return reply.send({
        id: org.id,
        name: org.name,
        slug: org.slug,
        createdAt: org.createdAt.toISOString(),
      });
    },
  });

  r.route({
    method: 'GET',
    url: '/api/organizations/members',
    preHandler: app.requireSession,
    schema: {
      operationId: 'listMembers',
      tags,
      summary: 'List organization members',
      querystring: MembersQuery,
      response: { 200: MembersPage },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return organizations.listMembers(scope.orgId, req.query);
    },
  });

  r.route({
    method: 'PATCH',
    url: '/api/organizations/members/:id/role',
    preHandler: app.requireSession,
    schema: {
      operationId: 'updateMemberRole',
      tags,
      summary: "Change a member's role",
      params: MemberIdParam,
      body: UpdateMemberRole,
      response: { 200: Member, 404: ErrorBody, 409: ErrorBody },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      const ctx: MemberWriteContext = {
        orgId: scope.orgId,
        authOrgId: scope.authOrgId,
        headers: req.headers,
      };
      const member = await organizations.updateMemberRole(ctx, req.params.id, req.body.role);
      if (!member) {
        throw new NotFoundError('Member', req.params.id);
      }
      return member;
    },
  });

  r.route({
    method: 'DELETE',
    url: '/api/organizations/members/:id',
    preHandler: app.requireSession,
    schema: {
      operationId: 'removeMember',
      tags,
      summary: 'Remove an organization member',
      params: MemberIdParam,
      response: { 204: z.void(), 404: ErrorBody, 409: ErrorBody },
    },
    handler: async (req, reply) => {
      const scope = await resolveScope(container, req);
      const ctx: MemberWriteContext = {
        orgId: scope.orgId,
        authOrgId: scope.authOrgId,
        headers: req.headers,
      };
      const removed = await organizations.removeMember(ctx, req.params.id);
      if (!removed) {
        throw new NotFoundError('Member', req.params.id);
      }
      return reply.code(204).send();
    },
  });

  r.route({
    method: 'POST',
    url: '/api/organizations/invites',
    preHandler: app.requireSession,
    schema: {
      operationId: 'createInvite',
      tags,
      summary: 'Invite a member or student into the active organization',
      body: CreateInvite,
      response: { 201: Invitation, 409: ErrorBody },
    },
    handler: async (req, reply) => {
      const scope = await resolveScope(container, req);
      const invitation = await organizations.createInvite({
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
    url: '/api/organizations/invites/accept',
    preHandler: app.requireSession,
    schema: {
      operationId: 'acceptInvite',
      tags,
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

export async function organizationsPublicRoutes(
  app: FastifyInstance,
  container: Container,
  opts: { secureCookies: boolean },
): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.route({
    method: 'POST',
    url: '/api/organizations/invites/activate',
    schema: {
      operationId: 'activateInvite',
      tags: ['Organizations'],
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
