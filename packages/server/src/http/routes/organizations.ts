import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  AcceptInvite,
  AcceptInviteResult,
  AssignmentList,
  ContentIdParam,
  CreateInvite,
  CreateOrganization,
  CreateRole,
  Invite,
  NotificationCategoryDefaults,
  NotificationCategoryList,
  NotificationChannelInfos,
  NotificationListScopeQuery,
  NotificationTypeInfos,
  ReplaceNotificationCategories,
  MembersPage,
  MembersQuery,
  GetInviteResult,
  InviteTokenParam,
  OrgRoleList,
  OrgRoleView,
  OrgUserContentParam,
  OrgUserIdParam,
  Organization,
  RoleKeyParam,
  SetRole,
  TransferOwnership,
  UpdateOrganization,
  UpdateRole,
  refusals,
} from '../schemas/index.js';
import type { Invite as InviteRecord } from '@headless-lms/core/organizations';
import { NotFoundError } from '@headless-lms/core/shared/errors';
import type { Container } from '../../app/container.js';
import { resolveActor, resolveCaller } from '../scope.js';
import { describeOperation } from '../operations.js';
import { typesForList } from '@headless-lms/core/shared/notification-categories';

function inviteView(invite: InviteRecord) {
  return {
    id: invite.id,
    email: invite.email,
    roleKey: invite.roleKey,
    status: invite.status,
    expiresAt: invite.expiresAt,
    createdAt: invite.createdAt,
  };
}

export async function organizationsRoutes(
  app: FastifyInstance,
  container: Container,
): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const organizations = container.organizations;
  const tags = ['Organizations'];
  const peopleTags = ['People'];
  const roleTags = ['Roles'];

  r.route({
    method: 'POST',
    url: '/api/organizations',
    preHandler: app.requireSession,
    config: { operation: 'organizations.createOrganization' },
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

  r.route({
    method: 'PATCH',
    url: '/api/organizations',
    preHandler: app.requireOrgSession,
    config: { operation: 'organizations.updateOrganization' },
    schema: {
      operationId: 'updateOrganization',
      tags,
      summary: 'Update the active organization',
      description: `${describeOperation('organizations.updateOrganization')} Changes its name or slug; 409 when the slug is taken.`,
      body: UpdateOrganization,
      response: { 200: Organization, ...refusals(403, 409) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      const org = await organizations.updateOrganization(req.body, actor);
      return {
        id: org.id,
        name: org.name,
        slug: org.slug,
        createdAt: org.createdAt.toISOString(),
      };
    },
  });

  r.route({
    method: 'POST',
    url: '/api/organizations/ownership',
    preHandler: app.requireOrgSession,
    config: { operation: 'organizations.transferOwnership' },
    schema: {
      operationId: 'transferOwnership',
      tags,
      summary: 'Transfer ownership of the organization',
      description:
        "Owner only. The new owner must be an active member. The previous owner takes the named org role, Member by default. 403 for anyone else, including the owner's API keys.",
      body: TransferOwnership,
      response: { 204: z.void(), ...refusals(403, 404, 409) },
    },
    handler: async (req, reply) => {
      const actor = await resolveActor(container, req);
      await organizations.transferOwnership(req.body, actor);
      return reply.code(204).send();
    },
  });

  r.route({
    method: 'GET',
    url: '/api/organizations/roles',
    preHandler: app.requireOrgSession,
    config: { operation: 'organizations.listRoles' },
    schema: {
      operationId: 'listRoles',
      tags: roleTags,
      summary: "The organization's roles",
      description: `${describeOperation('organizations.listRoles')} Each role with its levels, permissions and the number of people who hold it.`,
      response: { 200: OrgRoleList, ...refusals(403) },
    },
    handler: async (req) => organizations.listRoles(await resolveActor(container, req)),
  });

  r.route({
    method: 'GET',
    url: '/api/organizations/roles/:key',
    preHandler: app.requireOrgSession,
    config: { operation: 'organizations.getRole' },
    schema: {
      operationId: 'getRole',
      tags: roleTags,
      summary: 'Read a role',
      description: describeOperation('organizations.getRole'),
      params: RoleKeyParam,
      response: { 200: OrgRoleView, ...refusals(403, 404) },
    },
    handler: async (req) =>
      organizations.getRole(req.params.key, await resolveActor(container, req)),
  });

  r.route({
    method: 'PATCH',
    url: '/api/organizations/roles/:key',
    preHandler: app.requireOrgSession,
    config: { operation: 'organizations.updateRole' },
    schema: {
      operationId: 'updateRole',
      tags: roleTags,
      summary: 'Rename or change a role',
      description: `${describeOperation('organizations.updateRole')} A rename needs nothing else. Changing permissions, levels or the team flag needs every permission the role holds before and after the change (403 names the missing ones). Owner and Member can only be renamed (409). Names are unique in the organization (409).`,
      params: RoleKeyParam,
      body: UpdateRole,
      response: { 200: OrgRoleView, ...refusals(400, 403, 404, 409) },
    },
    handler: async (req) =>
      organizations.updateRole(req.params.key, req.body, await resolveActor(container, req)),
  });

  r.route({
    method: 'POST',
    url: '/api/organizations/roles',
    preHandler: app.requireOrgSession,
    config: { operation: 'organizations.createRole' },
    schema: {
      operationId: 'createRole',
      tags: roleTags,
      summary: 'Add a role',
      description: `${describeOperation('organizations.createRole')} The role starts from a deployment role (\`base\`) and needs every permission it holds.`,
      body: CreateRole,
      response: { 201: OrgRoleView, ...refusals(400, 403, 409) },
    },
    handler: async (req, reply) =>
      reply
        .code(201)
        .send(await organizations.createRole(req.body, await resolveActor(container, req))),
  });

  r.route({
    method: 'DELETE',
    url: '/api/organizations/roles/:key/customization',
    preHandler: app.requireOrgSession,
    config: { operation: 'organizations.resetRole' },
    schema: {
      operationId: 'resetRole',
      tags: roleTags,
      summary: "Reset a role to the deployment's version",
      description: `${describeOperation('organizations.resetRole')} Needs every permission the role holds before and after.`,
      params: RoleKeyParam,
      response: { 200: OrgRoleView, ...refusals(403, 404, 409) },
    },
    handler: async (req) =>
      organizations.resetRole(req.params.key, await resolveActor(container, req)),
  });

  r.route({
    method: 'DELETE',
    url: '/api/organizations/roles/:key',
    preHandler: app.requireOrgSession,
    config: { operation: 'organizations.deleteRole' },
    schema: {
      operationId: 'deleteRole',
      tags: roleTags,
      summary: 'Delete a role the organization added',
      description: `${describeOperation('organizations.deleteRole')} Refused while anyone holds it (409, with the count).`,
      params: RoleKeyParam,
      response: { 204: z.void(), ...refusals(403, 404, 409) },
    },
    handler: async (req, reply) => {
      await organizations.deleteRole(req.params.key, await resolveActor(container, req));
      return reply.code(204).send();
    },
  });

  r.route({
    method: 'GET',
    url: '/api/organizations/people',
    preHandler: app.requireOrgSession,
    config: { operation: 'organizations.listTeam' },
    schema: {
      operationId: 'listTeam',
      tags: peopleTags,
      summary: "The organization's team",
      description: `${describeOperation('organizations.listTeam')} Everyone with an org role other than Member or a role on a content item, invited people included.`,
      querystring: MembersQuery,
      response: { 200: MembersPage, ...refusals(403) },
    },
    handler: async (req) => organizations.listTeam(req.query, await resolveActor(container, req)),
  });

  r.route({
    method: 'GET',
    url: '/api/organizations/people/:orgUserId/roles',
    preHandler: app.requireOrgSession,
    config: { operation: 'organizations.listAssignments' },
    schema: {
      operationId: 'listPersonRoles',
      tags: peopleTags,
      summary: "A person's roles",
      description: `${describeOperation('organizations.listAssignments')} Their org role and every role they hold on a content item.`,
      params: OrgUserIdParam,
      response: { 200: AssignmentList, ...refusals(403) },
    },
    handler: async (req) =>
      organizations.listAssignments(req.params.orgUserId, await resolveActor(container, req)),
  });

  r.route({
    method: 'PUT',
    url: '/api/organizations/people/:orgUserId/roles/org',
    preHandler: app.requireOrgSession,
    config: { operation: 'organizations.setOrgRole' },
    schema: {
      operationId: 'setOrgRole',
      tags: peopleTags,
      summary: "Set a person's org role",
      description: `${describeOperation('organizations.setOrgRole')} Needs every permission the old and the new role hold. Nobody changes their own roles, and the owner's role changes only by transfer.`,
      params: OrgUserIdParam,
      body: SetRole,
      response: { 200: AssignmentList, ...refusals(403, 404, 409) },
    },
    handler: async (req) =>
      organizations.setOrgRole(
        req.params.orgUserId,
        req.body.roleKey,
        await resolveActor(container, req),
      ),
  });

  r.route({
    method: 'PUT',
    url: '/api/organizations/people/:orgUserId/roles/content/:contentId',
    preHandler: app.requireOrgSession,
    config: { operation: 'organizations.assignRole' },
    schema: {
      operationId: 'assignRole',
      tags: peopleTags,
      summary: 'Give a person a role on a content item',
      description: `${describeOperation('organizations.assignRole')} The role must list the item's type as a level. Needs every permission the old and the new role give there.`,
      params: OrgUserContentParam,
      body: SetRole,
      response: { 200: AssignmentList, ...refusals(403, 404, 409) },
    },
    handler: async (req) =>
      organizations.assignRole(
        req.params.orgUserId,
        req.params.contentId,
        req.body.roleKey,
        await resolveActor(container, req),
      ),
  });

  r.route({
    method: 'DELETE',
    url: '/api/organizations/people/:orgUserId/roles/content/:contentId',
    preHandler: app.requireOrgSession,
    config: { operation: 'organizations.unassignRole' },
    schema: {
      operationId: 'unassignRole',
      tags: peopleTags,
      summary: "Remove a person's role on a content item",
      description: describeOperation('organizations.unassignRole'),
      params: OrgUserContentParam,
      response: { 200: AssignmentList, ...refusals(403, 404) },
    },
    handler: async (req) =>
      organizations.unassignRole(
        req.params.orgUserId,
        req.params.contentId,
        await resolveActor(container, req),
      ),
  });

  r.route({
    method: 'GET',
    url: '/api/organizations/content/:contentId/roles',
    preHandler: app.requireOrgSession,
    config: { operation: 'organizations.listAssignmentsOn' },
    schema: {
      operationId: 'listRolesOn',
      tags: peopleTags,
      summary: 'The people with a role on a content item',
      description: describeOperation('organizations.listAssignmentsOn'),
      params: ContentIdParam,
      response: { 200: AssignmentList, ...refusals(403) },
    },
    handler: async (req) =>
      organizations.listAssignmentsOn(req.params.contentId, await resolveActor(container, req)),
  });

  r.route({
    method: 'DELETE',
    url: '/api/organizations/people/:orgUserId',
    preHandler: app.requireOrgSession,
    config: { operation: 'organizations.removePerson' },
    schema: {
      operationId: 'removePerson',
      tags: peopleTags,
      summary: 'Remove a person from the organization',
      description: `${describeOperation('organizations.removePerson')} Needs every permission the person holds, where they hold it. Revokes their API keys and connected apps here. The owner can't be removed (409); neither can someone whose posts must be kept (409).`,
      params: OrgUserIdParam,
      response: { 204: z.void(), ...refusals(403, 404, 409) },
    },
    handler: async (req, reply) => {
      await organizations.removePerson(req.params.orgUserId, await resolveActor(container, req));
      return reply.code(204).send();
    },
  });

  r.route({
    method: 'POST',
    url: '/api/organizations/invites',
    preHandler: app.requireOrgSession,
    config: { operation: 'organizations.createInvite' },
    schema: {
      operationId: 'createInvite',
      tags: peopleTags,
      summary: 'Invite a person with an org role',
      description: `${describeOperation('organizations.createInvite')} The person is created by this call, so access and item roles can be given before they accept. Needs every permission the role holds; never \`owner\` (409).`,
      body: CreateInvite,
      response: { 201: Invite, ...refusals(403, 404, 409) },
    },
    handler: async (req, reply) => {
      const caller = await resolveCaller(container, req);
      const invite = await organizations.createInvite(req.body, caller.actor, caller.userId);
      return reply.code(201).send(inviteView(invite));
    },
  });

  r.route({
    method: 'POST',
    url: '/api/organizations/people/:orgUserId/invite/resend',
    preHandler: app.requireOrgSession,
    config: { operation: 'organizations.resendInvite' },
    schema: {
      operationId: 'resendInvite',
      tags: peopleTags,
      summary: "Resend a person's pending invite",
      description: `${describeOperation('organizations.resendInvite')} Issues a new link; the resender becomes the inviter.`,
      params: OrgUserIdParam,
      response: { 204: z.void(), ...refusals(403, 404) },
    },
    handler: async (req, reply) => {
      const caller = await resolveCaller(container, req);
      await organizations.resendInvite(req.params.orgUserId, caller.actor, caller.userId);
      return reply.code(204).send();
    },
  });

  r.route({
    method: 'DELETE',
    url: '/api/organizations/people/:orgUserId/invite',
    preHandler: app.requireOrgSession,
    config: { operation: 'organizations.cancelInvite' },
    schema: {
      operationId: 'cancelInvite',
      tags: peopleTags,
      summary: "Cancel a person's pending invite",
      description: `${describeOperation('organizations.cancelInvite')} Someone still invited who holds no access and no item role is removed with it.`,
      params: OrgUserIdParam,
      response: { 204: z.void(), ...refusals(403, 404) },
    },
    handler: async (req, reply) => {
      await organizations.cancelInvite(req.params.orgUserId, await resolveActor(container, req));
      return reply.code(204).send();
    },
  });

  r.route({
    method: 'GET',
    url: '/api/organizations/invites/:token',
    config: { operation: 'organizations.peekInvite' },
    schema: {
      operationId: 'getInvite',
      tags: peopleTags,
      summary: 'Read an invite by its token',
      description:
        'Public: no session needed. The same 404 answers forged, expired and accepted tokens, so a probe learns nothing.',
      params: InviteTokenParam,
      response: { 200: GetInviteResult, ...refusals(404) },
    },
    handler: async (req) => {
      const invite = await organizations.peekInvite(req.params.token);
      if (!invite) {
        throw new NotFoundError('Invite', 'token');
      }
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
    config: { operation: 'organizations.acceptInvite' },
    schema: {
      operationId: 'acceptInvite',
      tags: peopleTags,
      summary: 'Accept an invite with the signed-in account',
      description:
        "For any signed-in person whose email matches the invitation. Makes the invite's organization the session's active one. 400 when the token is invalid or expired, the email does not match, or the inviter no longer holds the role.",
      body: AcceptInvite,
      response: { 200: AcceptInviteResult, ...refusals(400, 404) },
    },
    handler: async (req) => {
      const user = await container.identity.getUserByExternalId(req.authUser.id);
      if (!user) {
        throw new NotFoundError('User', req.authUser.id);
      }
      const accepted = await organizations.acceptInvite({
        token: req.body.token,
        userId: user.id,
        email: req.authUser.email,
      });
      const org = await organizations.getById(accepted.orgId);
      if (!org) {
        throw new NotFoundError('Organization', accepted.orgId);
      }
      await container.sessions.stampActiveOrganization(req.headers, org.id);
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
