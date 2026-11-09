import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Container } from '../../app/container.js';
import {
  ApiKeyIdParam,
  ApiKeyList,
  ApiKeyRoleList,
  ClientIdParam,
  ConnectedAppList,
  CreateApiKey,
  CreatedApiKey,
  PermissionDefinitionList,
  ViewerPermissions,
  refusals,
} from '../schemas/index.js';
import { resolveActor } from '../scope.js';

export async function accessRoutes(app: FastifyInstance, container: Container): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const tags = ['Access'];
  const organizations = container.organizations;

  r.route({
    method: 'GET',
    url: '/api/access/permissions/list',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'listPermissions',
      tags,
      summary: 'Every permission, with its label, description and level',
      description: `Any active member of the organization. For role screens, the key-creation screen and the consent screen.`,
      response: { 200: PermissionDefinitionList, ...refusals(403) },
    },
    handler: async (req) => {
      await resolveActor(container, req);
      return organizations.permissionList();
    },
  });

  r.route({
    method: 'GET',
    url: '/api/access/permissions',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'getMyPermissions',
      tags,
      summary: 'Your effective permissions in this organization',
      description: `Any active member of the organization. Your org role, whether you own the organization, the permissions you hold on the organization, and the ones you hold on each content item.`,
      response: { 200: ViewerPermissions, ...refusals(403) },
    },
    handler: async (req) => organizations.viewerPermissions(await resolveActor(container, req)),
  });

  r.route({
    method: 'GET',
    url: '/api/access/apps',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'listConnectedApps',
      tags,
      summary: 'Apps connected to this organization as you',
      description: `Any active member of the organization. The apps you connected to this organization, each with the scopes you granted and when.`,
      response: { 200: ConnectedAppList, ...refusals(403) },
    },
    handler: async (req) => organizations.listConnectedApps(await resolveActor(container, req)),
  });

  r.route({
    method: 'DELETE',
    url: '/api/access/apps/:clientId',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'revokeConnectedApp',
      tags,
      summary: 'Disconnect an app',
      description: `Any active member of the organization. Revokes your consent and tokens for the app in this organization; its next call is refused.`,
      params: ClientIdParam,
      response: { 204: z.void(), ...refusals(403) },
    },
    handler: async (req, reply) => {
      await organizations.revokeConnectedApp(
        req.params.clientId,
        await resolveActor(container, req),
      );
      return reply.code(204).send();
    },
  });

  r.route({
    method: 'GET',
    url: '/api/access/api-keys',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'listApiKeys',
      tags,
      summary: 'Your API keys for this organization',
      description: `Requires \`api_keys:read\`. Your keys for this organization with their role and expiry. The key itself is never returned again after it is created.`,
      response: { 200: ApiKeyList, ...refusals(403) },
    },
    handler: async (req) => organizations.listApiKeys(await resolveActor(container, req)),
  });

  r.route({
    method: 'GET',
    url: '/api/access/api-keys/roles',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'listApiKeyRoles',
      tags,
      summary: 'The roles you can put on an API key',
      description: `Requires \`api_keys:write\`. The organization's roles whose every permission you hold somewhere.`,
      response: { 200: ApiKeyRoleList, ...refusals(403) },
    },
    handler: async (req) => organizations.listApiKeyRoles(await resolveActor(container, req)),
  });

  r.route({
    method: 'POST',
    url: '/api/access/api-keys',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'createApiKey',
      tags,
      summary: 'Create an API key',
      description: `Requires \`api_keys:write\`. The key acts as you in this organization with the permissions of the role given, never beyond what you hold at the time of each request. Send it in the \`x-api-key\` header or as \`Authorization: Bearer <key>\`; every route under /api and /mcp accepts it. 403 when the role holds a permission you hold nowhere; 404 when the organization has no such role. The key is returned once.`,
      body: CreateApiKey,
      response: { 201: CreatedApiKey, ...refusals(400, 403, 404) },
    },
    handler: async (req, reply) => {
      const created = await organizations.createApiKey(
        req.body,
        await resolveActor(container, req),
      );
      return reply.code(201).send(created);
    },
  });

  r.route({
    method: 'DELETE',
    url: '/api/access/api-keys/:id',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'deleteApiKey',
      tags,
      summary: 'Revoke an API key',
      description: `Requires \`api_keys:delete\`. 404 when the key is not one of yours in this organization.`,
      params: ApiKeyIdParam,
      response: { 204: z.void(), ...refusals(403, 404) },
    },
    handler: async (req, reply) => {
      await organizations.deleteApiKey(req.params.id, await resolveActor(container, req));
      return reply.code(204).send();
    },
  });
}
