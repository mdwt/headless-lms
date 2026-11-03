import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  AcceptInvite,
  AcceptInviteResult,
  CreateInvite,
  CreateOrganization,
  Invite,
  MemberIdParam,
  NotificationCategoryDefaults,
  NotificationCategoryList,
  NotificationChannelInfos,
  NotificationListScopeQuery,
  NotificationTypeInfos,
  ReplaceNotificationCategories,
  MemberRoleChange,
  MembersPage,
  MembersQuery,
  GetInviteResult,
  InviteTokenParam,
  Organization,
  UpdateMemberRole,
  UpdateOrganization,
  refusals,
} from '../schemas/index.js';
import type { MemberWriteContext } from '@headless-lms/core/organizations';
import { NotFoundError } from '@headless-lms/core/shared/errors';
import type { Container } from '../../app/container.js';
import { resolveConfiguratorScope, resolveScope } from '../scope.js';
import { typesForList } from '@headless-lms/core/shared/notification-categories';

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
      description:
        'For any signed-in person, including one with no organization yet. The caller becomes its owner.',
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
      summary: 'Update the active organization (staff)',
      description: 'Owner or admin. Changes its name or slug; 409 when the slug is taken.',
      body: UpdateOrganization,
      response: { 200: Organization, ...refusals(403, 409) },
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
      summary: "List the organization's team members (staff)",
      description:
        'Staff only (owner, admin, instructor). The team: everyone in the organization who is not a student.',
      querystring: MembersQuery,
      response: { 200: MembersPage, ...refusals(403) },
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
      summary: "Change a member's role (staff)",
      description:
        'Owner or admin only. The owner role can be neither granted nor changed (409), and only a moderator can become a student.',
      params: MemberIdParam,
      body: UpdateMemberRole,
      response: { 200: MemberRoleChange, ...refusals(403, 404, 409) },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      const ctx: MemberWriteContext = {
        orgId: scope.orgId,
        authOrgId: scope.authOrgId,
        headers: req.headers,
      };
      const member = await organizations.updateMemberRole(
        ctx,
        { id: scope.orgUserId, role: scope.role },
        req.params.id,
        req.body.role,
      );
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
      summary: 'Remove an organization member (staff)',
      description:
        'Owner or admin only. Removing a pending member cancels their invite. The owner cannot be removed (409).',
      params: MemberIdParam,
      response: { 204: z.void(), ...refusals(403, 404, 409) },
    },
    handler: async (req, reply) => {
      const scope = await resolveScope(container, req);
      const ctx: MemberWriteContext = {
        orgId: scope.orgId,
        authOrgId: scope.authOrgId,
        headers: req.headers,
      };
      const removed = await organizations.removeMember(
        ctx,
        { id: scope.orgUserId, role: scope.role },
        req.params.id,
      );
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
      summary: 'Invite a member or student into the active organization (staff)',
      description:
        'Owner or admin only. A student is created by this call, so their access can be granted before they accept. 409 when a student with that email is already in the organization.',
      body: CreateInvite,
      response: { 201: Invite, ...refusals(403, 409) },
    },
    handler: async (req, reply) => {
      // Domain ids, not the session's auth ids: invites FK to organizations.id
      // and users.id.
      const scope = await resolveScope(container, req);
      const invite = await organizations.createInvite(
        { id: scope.orgUserId, role: scope.role },
        {
          orgId: scope.orgId,
          inviterUserId: scope.userId,
          email: req.body.email,
          role: req.body.role,
          ...(req.body.firstName !== undefined && { firstName: req.body.firstName }),
          ...(req.body.lastName !== undefined && { lastName: req.body.lastName }),
          sendEmail: req.body.sendEmail,
        },
      );

      req.log.debug({ inviteId: invite.id }, 'created invite');
      return reply.code(201).send({
        id: invite.id,
        email: invite.email,
        role: invite.role,
        status: invite.status,
        expiresAt: invite.expiresAt,
        createdAt: invite.createdAt,
      });
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
      description:
        'Public: no session needed. The same 404 answers forged, expired and accepted tokens, so a probe learns nothing.',
      params: InviteTokenParam,
      response: { 200: GetInviteResult, ...refusals(404) },
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
      summary: 'Accept an invite with the signed-in account',
      description:
        "For any signed-in person whose email matches the invitation. Makes the invite's organization the session's active one. 400 when the token is invalid or expired, or the email does not match.",
      body: AcceptInvite,
      response: { 200: AcceptInviteResult, ...refusals(400, 404) },
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

  const notificationTags = ['Notifications'];

  r.route({
    method: 'GET',
    url: '/api/notification-types',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'listNotificationTypes',
      tags: notificationTags,
      summary: 'List the notification types a category list can cover (staff)',
      description:
        'Owner or admin only. `scope=org` lists the types the org list can cover, `scope=community` those a community list can cover. Each type carries all its scopes, so an editor can tell which types can be per space.',
      querystring: NotificationListScopeQuery,
      response: { 200: NotificationTypeInfos, ...refusals(403) },
    },
    handler: async (req) => {
      await resolveConfiguratorScope(container, req);
      return typesForList(container.notificationTypes, req.query.scope);
    },
  });

  r.route({
    method: 'GET',
    url: '/api/notification-channels',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'listNotificationChannels',
      tags: notificationTags,
      summary: 'List the notification channels this deployment can deliver on (staff)',
      description: 'Owner or admin only. `inApp` is always first.',
      response: { 200: NotificationChannelInfos, ...refusals(403) },
    },
    handler: async (req) => {
      await resolveConfiguratorScope(container, req);
      return container.notificationChannels.list().map((channel) => ({ channel }));
    },
  });

  r.route({
    method: 'GET',
    url: '/api/notification-categories',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'getOrgNotificationCategories',
      tags: notificationTags,
      summary: "Get the organization's notification categories (staff)",
      description:
        'Owner or admin only. The list in use for notifications outside any community, with `source` saying whether it is the default or a stored list.',
      response: { 200: NotificationCategoryList, ...refusals(403) },
    },
    handler: async (req) => {
      const scope = await resolveConfiguratorScope(container, req);
      return container.notificationCategories.org.get(scope.orgId, scope.orgId);
    },
  });

  r.route({
    method: 'PUT',
    url: '/api/notification-categories',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'replaceOrgNotificationCategories',
      tags: notificationTags,
      summary: "Replace the organization's notification categories (staff)",
      description:
        'Owner or admin only. Stores the whole list. 422 when a key repeats, a type cannot be in the org list, a reason is not allowed for its type, a channel is not configured, or earlier categories already cover everything a category covers.',
      body: ReplaceNotificationCategories,
      response: { 200: NotificationCategoryList, ...refusals(400, 403, 422) },
    },
    handler: async (req) => {
      const scope = await resolveConfiguratorScope(container, req);
      return container.notificationCategories.org.replace(
        scope.orgId,
        scope.orgId,
        req.body.categories,
      );
    },
  });

  r.route({
    method: 'DELETE',
    url: '/api/notification-categories',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'resetOrgNotificationCategories',
      tags: notificationTags,
      summary: 'Go back to the default notification categories for the organization (staff)',
      description: 'Owner or admin only. Removes the stored list; the default applies again.',
      response: { 204: z.void(), ...refusals(403) },
    },
    handler: async (req, reply) => {
      const scope = await resolveConfiguratorScope(container, req);
      await container.notificationCategories.org.reset(scope.orgId, scope.orgId);
      return reply.code(204).send();
    },
  });

  r.route({
    method: 'GET',
    url: '/api/notification-categories/defaults',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'getDefaultNotificationCategories',
      tags: notificationTags,
      summary: 'Get the default notification categories (staff)',
      description:
        'Owner or admin only. The default org list (`scope=org`) or community list (`scope=community`), offering only the configured channels.',
      querystring: NotificationListScopeQuery,
      response: { 200: NotificationCategoryDefaults, ...refusals(403) },
    },
    handler: async (req) => {
      await resolveConfiguratorScope(container, req);
      const service =
        req.query.scope === 'org'
          ? container.notificationCategories.org
          : container.notificationCategories.community;
      return { categories: service.defaults() };
    },
  });
}
