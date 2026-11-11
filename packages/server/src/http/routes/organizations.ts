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
  CreatedOrganization,
  OrganizationHosts,
  ReplaceOrganizationHosts,
  ResendInvite,
  RoleKeyParam,
  SetRole,
  TransferOwnership,
  UpdateOrganization,
  UpdateRole,
  refusals,
} from '../schemas/index.js';
import type { CreatedInvite } from '@headless-lms/core/organizations';
import type { Container } from '../../app/container.js';
import { resolveActor, resolveCaller } from '../scope.js';

function inviteView(invite: CreatedInvite) {
  return {
    id: invite.id,
    orgUserId: invite.orgUserId,
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
    schema: {
      operationId: 'createOrganization',
      tags,
      summary: 'Create an organization and make it active',
      description:
        'For any signed-in person, including one with no organization yet. The caller becomes its owner. The organization starts with one host for both member apps, its slug under the platform host, returned as `hosts`.',
      body: CreateOrganization,
      response: { 201: CreatedOrganization, ...refusals(400) },
    },
    handler: async (req, reply) => {
      const org = await organizations.createOrganization(req.body, req.headers);
      return reply.code(201).send({
        name: org.name,
        slug: org.slug,
        id: org.id,
        createdAt: org.createdAt.toISOString(),
        hosts: org.hosts,
      });
    },
  });

  r.route({
    method: 'PATCH',
    url: '/api/organizations',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'updateOrganization',
      tags,
      summary: 'Update the active organization',
      description: `Requires \`organizations:write\`. Changes its name or slug; 409 when the slug is taken.`,
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
    method: 'GET',
    url: '/api/organizations/hosts',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'getOrganizationHosts',
      tags,
      summary: "Get the organization's hosts",
      description: `Requires \`organizations:read\`. The origins of the organization's member apps, used for the links in emails, invites and calendar files.`,
      response: { 200: OrganizationHosts, ...refusals(403) },
    },
    handler: async (req) => container.hosts.get(await resolveActor(container, req)),
  });

  r.route({
    method: 'PUT',
    url: '/api/organizations/hosts',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'replaceOrganizationHosts',
      tags,
      summary: "Replace the organization's hosts",
      description: `Requires \`organizations:write\`. Stores both hosts. Links to courses and downloads use \`courses\`, links to communities and events use \`community\`. The next link uses the new value.`,
      body: ReplaceOrganizationHosts,
      response: { 200: OrganizationHosts, ...refusals(400, 403) },
    },
    handler: async (req) => container.hosts.replace(req.body, await resolveActor(container, req)),
  });

  r.route({
    method: 'POST',
    url: '/api/organizations/transfer-ownership',
    preHandler: app.requireOrgSession,
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
    schema: {
      operationId: 'listRoles',
      tags: roleTags,
      summary: "The organization's roles",
      description: `Requires \`roles:read\`. Each role with its levels, permissions and the number of people who hold it.`,
      response: { 200: OrgRoleList, ...refusals(403) },
    },
    handler: async (req) => organizations.listRoles(await resolveActor(container, req)),
  });

  r.route({
    method: 'GET',
    url: '/api/organizations/roles/:key',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'getRole',
      tags: roleTags,
      summary: 'Read a role',
      description: 'Requires `roles:read`.',
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
    schema: {
      operationId: 'updateRole',
      tags: roleTags,
      summary: 'Rename or change a role',
      description: `Requires \`roles:write\`. A rename needs nothing else. Changing permissions, levels or the team flag needs every permission the role holds before and after the change (403 names the missing ones). Owner and Member can only be renamed (409). Names are unique in the organization (409).`,
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
    schema: {
      operationId: 'createRole',
      tags: roleTags,
      summary: 'Add a role',
      description: `Requires \`roles:write\`. The role starts from a deployment role (\`base\`) and needs every permission it holds.`,
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
    schema: {
      operationId: 'resetRole',
      tags: roleTags,
      summary: "Reset a role to the deployment's version",
      description: `Requires \`roles:write\`. Needs every permission the role holds before and after.`,
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
    schema: {
      operationId: 'deleteRole',
      tags: roleTags,
      summary: 'Delete a role the organization added',
      description: `Requires \`roles:delete\`. Refused while anyone holds it (409, with the count).`,
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
    schema: {
      operationId: 'listTeam',
      tags: peopleTags,
      summary: "The organization's team",
      description: `Requires \`people:read\`. Everyone with an org role other than Member or a role on a content item, invited people included.`,
      querystring: MembersQuery,
      response: { 200: MembersPage, ...refusals(403) },
    },
    handler: async (req) => organizations.listTeam(req.query, await resolveActor(container, req)),
  });

  r.route({
    method: 'GET',
    url: '/api/organizations/people/:orgUserId/roles',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'listPersonRoles',
      tags: peopleTags,
      summary: "A person's roles",
      description: `Requires \`people:read\`. Their org role and every role they hold on a content item.`,
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
    schema: {
      operationId: 'setOrgRole',
      tags: peopleTags,
      summary: "Set a person's org role",
      description: `Requires \`people:write\`. Needs every permission the old and the new role hold. Nobody changes their own roles, and the owner's role changes only by transfer.`,
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
    schema: {
      operationId: 'assignRole',
      tags: peopleTags,
      summary: 'Give a person a role on a content item',
      description: `Requires \`people:write\`. The role must list the item's type as a level. Needs every permission the old and the new role give there.`,
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
    schema: {
      operationId: 'unassignRole',
      tags: peopleTags,
      summary: "Remove a person's role on a content item",
      description: 'Requires `people:write`.',
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
    schema: {
      operationId: 'listRolesOn',
      tags: peopleTags,
      summary: 'The people with a role on a content item',
      description: 'Requires `people:read`.',
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
    schema: {
      operationId: 'removePerson',
      tags: peopleTags,
      summary: 'Remove a person from the organization',
      description: `Requires \`people:delete\`. Needs every permission the person holds, where they hold it. Revokes their API keys and connected apps here. The owner can't be removed (409); neither can someone whose posts must be kept (409).`,
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
    schema: {
      operationId: 'createInvite',
      tags: peopleTags,
      summary: 'Invite a person with an org role',
      description: `Requires \`people:write\`. The person is created by this call and returned as \`orgUserId\`, so access and item roles can be given before they accept. Needs every permission the role holds; never \`owner\` (409). \`host\` is the app the invite link opens and must be one of the organization's hosts (409).`,
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
    schema: {
      operationId: 'resendInvite',
      tags: peopleTags,
      summary: "Resend a person's pending invite",
      description: `Requires \`people:write\`. Issues a new link; the resender becomes the inviter. \`host\` is the app the invite link opens and must be one of the organization's hosts (409).`,
      params: OrgUserIdParam,
      querystring: ResendInvite,
      response: { 204: z.void(), ...refusals(403, 404, 409) },
    },
    handler: async (req, reply) => {
      const caller = await resolveCaller(container, req);
      await organizations.resendInvite(
        req.params.orgUserId,
        caller.actor,
        caller.userId,
        req.query.host,
      );
      return reply.code(204).send();
    },
  });

  r.route({
    method: 'DELETE',
    url: '/api/organizations/people/:orgUserId/invite',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'cancelInvite',
      tags: peopleTags,
      summary: "Cancel a person's pending invite",
      description: `Requires \`people:write\`. Someone still invited who holds no access and no item role is removed with it.`,
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
    schema: {
      operationId: 'getInvite',
      tags: peopleTags,
      summary: 'Read an invite by its token',
      description:
        'Public: no session needed. The same 404 answers forged, expired and accepted tokens, so a probe learns nothing.',
      params: InviteTokenParam,
      response: { 200: GetInviteResult, ...refusals(404) },
    },
    handler: async (req) => organizations.describeInvite(req.params.token),
  });

  r.route({
    method: 'POST',
    url: '/api/organizations/invites/accept',
    preHandler: app.requireSession,
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
      await organizations.acceptInvite(
        { token: req.body.token, authUserId: req.authUser.id, email: req.authUser.email },
        req.headers,
      );
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
      summary: 'List the notification types a category list can cover',
      description: `Requires one of \`notification_categories:read\`, \`communities:read\`. \`scope=org\` lists the types the org list can cover and needs \`notification_categories:read\`; \`scope=community\` lists those a community list can cover and also takes \`communities:read\` on any community. Each type carries all its scopes, so an editor can tell which types can be per space.`,
      querystring: NotificationListScopeQuery,
      response: { 200: NotificationTypeInfos, ...refusals(403) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return container.notificationCatalog.types(actor, req.query.scope);
    },
  });

  r.route({
    method: 'GET',
    url: '/api/notification-channels',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'listNotificationChannels',
      tags: notificationTags,
      summary: 'List the notification channels this deployment can deliver on',
      description: `Requires one of \`notification_categories:read\`, \`communities:read\`. \`communities:read\` on any community is enough. \`inApp\` is always first.`,
      response: { 200: NotificationChannelInfos, ...refusals(403) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return container.notificationCatalog.channels(actor);
    },
  });

  r.route({
    method: 'GET',
    url: '/api/notification-categories',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'getOrgNotificationCategories',
      tags: notificationTags,
      summary: "Get the organization's notification categories",
      description: `Requires \`notification_categories:read\`. The list in use for notifications outside any community, with \`source\` saying whether it is the default or a stored list.`,
      response: { 200: NotificationCategoryList, ...refusals(403) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return container.notificationCategories.org.get(actor.orgId, actor);
    },
  });

  r.route({
    method: 'PUT',
    url: '/api/notification-categories',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'replaceOrgNotificationCategories',
      tags: notificationTags,
      summary: "Replace the organization's notification categories",
      description: `Requires \`notification_categories:write\`. Stores the whole list. 422 when a key repeats, a type cannot be in the org list, a reason is not allowed for its type, a channel is not configured, or earlier categories already cover everything a category covers.`,
      body: ReplaceNotificationCategories,
      response: { 200: NotificationCategoryList, ...refusals(400, 403, 422) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return container.notificationCategories.org.replace(actor.orgId, req.body.categories, actor);
    },
  });

  r.route({
    method: 'DELETE',
    url: '/api/notification-categories',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'resetOrgNotificationCategories',
      tags: notificationTags,
      summary: 'Go back to the default notification categories for the organization',
      description: `Requires \`notification_categories:write\`. Removes the stored list; the default applies again.`,
      response: { 204: z.void(), ...refusals(403) },
    },
    handler: async (req, reply) => {
      const actor = await resolveActor(container, req);
      await container.notificationCategories.org.reset(actor.orgId, actor);
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
      summary: 'Get the default notification categories',
      description: `Requires one of \`notification_categories:read\`, \`communities:read\`. The default org list (\`scope=org\`, which needs \`notification_categories:read\`) or community list (\`scope=community\`, which also takes \`communities:read\` on any community), offering only the configured channels.`,
      querystring: NotificationListScopeQuery,
      response: { 200: NotificationCategoryDefaults, ...refusals(403) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return { categories: container.notificationCatalog.defaults(actor, req.query.scope) };
    },
  });
}
