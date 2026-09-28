import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  AcceptInvite,
  AcceptInviteResult,
  CreateInvite,
  CreateOrganization,
  ErrorBody,
  Invite,
  Member,
  MemberIdParam,
  MembersPage,
  MembersQuery,
  GetInviteResult,
  InviteTokenParam,
  Organization,
  UpdateMemberRole,
  UpdateOrganization,
} from '../schemas/index.js';
import type { MemberWriteContext } from '@headless-lms/core/organizations';
import { NotFoundError } from '@headless-lms/core/shared/errors';
import type { Container } from '../../app/container.js';
import { resolveScope } from '../scope.js';

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
    // Session only: a first-time signup has no active org yet, so requiring one
    // here would 401 the very call that produces it.
    preHandler: app.requireSession,
    schema: {
      operationId: 'createOrganization',
      tags,
      summary: 'Create an organization and make it active',
      body: CreateOrganization,
      response: { 201: Organization },
    },
    handler: async (req, reply) => {
      const org = await container.orgProvider.createOrganization(req.headers, req.body);
      return reply.code(201).send({
        name: org.name,
        slug: org.slug,
        id: org.id,
        createdAt: org.createdAt.toISOString(),
      });
    },
  });

  // Update the caller's active organization (name/slug). Writes go through Better
  // Auth, which enforces the caller's org-update permission (owner/admin).
  r.route({
    method: 'PATCH',
    url: '/api/organizations',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'updateOrganization',
      tags,
      summary: 'Update the active organization',
      body: UpdateOrganization,
      response: { 200: Organization, 409: ErrorBody },
    },
    handler: async (req, reply) => {
      const scope = await resolveScope(container, req);
      const org = await container.orgProvider.updateOrganization(
        req.headers,
        scope.authOrgId,
        req.body,
      );
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
    preHandler: app.requireOrgSession,
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
    preHandler: app.requireOrgSession,
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
    preHandler: app.requireOrgSession,
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
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'createInvite',
      tags,
      summary: 'Invite a member or student into the active organization',
      body: CreateInvite,
      response: { 201: Invite, 409: ErrorBody },
    },
    handler: async (req) => {
      // Domain ids, not the session's auth ids: invites FK to organizations.id
      // and users.id.
      const scope = await resolveScope(container, req);
      const invite = await organizations.createInvite({
        orgId: scope.orgId,
        inviterUserId: scope.userId,
        email: req.body.email,
        role: req.body.role,
        ...(req.body.firstName !== undefined && { firstName: req.body.firstName }),
        ...(req.body.lastName !== undefined && { lastName: req.body.lastName }),
        sendEmail: req.body.sendEmail,
      });

      req.log.debug({ invite }, 'created invite');
      return invite;
    },
  });

  // The invite landing page's first call, made before the invitee has any
  // session — so no guard. It turns the emailed token into the two facts the
  // page needs: who the invitation is for, and whether that address already has
  // an account. The email comes from the invitation row rather than the URL, so
  // it cannot be steered by editing the link.
  r.route({
    method: 'GET',
    url: '/api/organizations/invites/:token',
    schema: {
      operationId: 'getInvite',
      tags,
      summary: 'Read an invite by its token',
      params: InviteTokenParam,
      response: { 200: GetInviteResult, 404: ErrorBody },
    },
    handler: async (req) => {
      const invite = await organizations.peekInvite(req.params.token);
      if (!invite) {
        // Same answer for forged, expired, and already-accepted tokens: a
        // probe learns nothing about which invitations exist.
        throw new NotFoundError('Invite', 'token');
      }
      // Whether the address already has a login is deliberately not answered
      // here. The mirror cannot say — an admin's student is a person long
      // before they are an account — and asking the auth engine would mean
      // reading its tables for one boolean. The sign-up form discovers it
      // instead: a duplicate signup comes back 422 and the page flips to
      // sign-in.
      const person = await container.identity.getUserByEmail(invite.email);
      return {
        email: invite.email,
        firstName: person?.firstName ?? null,
        lastName: person?.lastName ?? null,
      };
    },
  });

  r.route({
    method: 'POST',
    url: '/api/organizations/invites/accept',
    preHandler: app.requireSession,
    schema: {
      operationId: 'acceptInvite',
      tags,
      summary: 'Accept an invite with the logged-in account',
      body: AcceptInvite,
      response: { 200: AcceptInviteResult, 400: ErrorBody },
    },
    handler: async (req) => {
      // No active org yet, so no resolveScope — but acceptInvite links a domain
      // users.id, never the auth account id.
      const user = await container.identity.getUserByExternalId(req.authUser.id);
      if (!user) {
        throw new NotFoundError('User', req.authUser.id);
      }
      const accepted = await container.organizations.acceptInvite({
        token: req.body.token,
        userId: user.id,
        email: req.authUser.email,
      });

      // The session predates this grant, so it carries no active org and every
      // org-scoped read would 401. Students are never org members, so the org
      // plugin's set-active cannot do it — stamp the session row directly.
      const org = await container.organizations.getById(accepted.orgId);
      if (!org) {
        throw new NotFoundError('Organization', accepted.orgId);
      }
      const stamped = await container.sessions.stampActiveOrganization(req.headers, org.id);

      req.log.info({ accepted, stamped }, 'accepted invite');
      return {};
    },
  });
}
