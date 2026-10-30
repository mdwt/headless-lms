import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { assertRoleHoldsScopes, scopeOptions } from '@headless-lms/core/organizations';
import type { Container } from '../../app/container.js';
import {
  ApiKeyIdParam,
  ApiKeyList,
  ClientIdParam,
  ConnectedAppList,
  CreateApiKey,
  CreatedApiKey,
  refusals,
  ScopeOptionList,
} from '../schemas/index.js';
import { resolveScope } from '../scope.js';

export async function accessRoutes(app: FastifyInstance, container: Container): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const tags = ['Access'];

  r.route({
    method: 'GET',
    url: '/api/access/scopes',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'listAccessScopes',
      tags,
      summary: 'Every access scope and whether your role can grant it',
      description:
        'Staff only (owner, admin, instructor). Each scope an app connection or API key can carry, marked with whether your role holds it. Only allowed scopes can be granted.',
      response: { 200: ScopeOptionList, ...refusals(403) },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return scopeOptions(scope.role);
    },
  });

  r.route({
    method: 'GET',
    url: '/api/access/apps',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'listConnectedApps',
      tags,
      summary: 'Apps connected to this organization as you',
      description:
        'Staff only (owner, admin, instructor). The apps you connected to this organization, each with the scopes you granted and when.',
      response: { 200: ConnectedAppList, ...refusals(403) },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return container.auth.listConnectedApps(req.headers, scope.authOrgId);
    },
  });

  r.route({
    method: 'DELETE',
    url: '/api/access/apps/:clientId',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'revokeConnectedApp',
      tags,
      summary: 'Disconnect an app',
      description:
        'Staff only (owner, admin, instructor). Revokes your consent and refresh tokens for the app in this organization; its next call is refused.',
      params: ClientIdParam,
      response: { 204: z.void(), ...refusals(403) },
    },
    handler: async (req, reply) => {
      const scope = await resolveScope(container, req);
      await container.auth.revokeConnectedApp(req.headers, scope.authOrgId, req.params.clientId);
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
      description:
        'Staff only (owner, admin, instructor). Your keys for this organization with their scopes. The key itself is never returned again after it is created.',
      response: { 200: ApiKeyList, ...refusals(403) },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return container.auth.listApiKeys(req.headers, scope.authOrgId);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/access/api-keys',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'createApiKey',
      tags,
      summary: 'Create an API key',
      description:
        'Staff only (owner, admin, instructor). The key acts as you in this organization with the scopes given. 403 when your role cannot hold one of them. The key is returned once.',
      body: CreateApiKey,
      response: { 201: CreatedApiKey, ...refusals(400, 403) },
    },
    handler: async (req, reply) => {
      const scope = await resolveScope(container, req);
      assertRoleHoldsScopes(scope.role, req.body.scopes);
      const created = await container.auth.createApiKey({
        authUserId: req.authUser.id,
        orgId: scope.authOrgId,
        name: req.body.name,
        scopes: req.body.scopes,
      });
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
      summary: 'Delete an API key',
      description:
        'Staff only (owner, admin, instructor). 404 when the key is not one of yours in this organization.',
      params: ApiKeyIdParam,
      response: { 204: z.void(), ...refusals(403, 404) },
    },
    handler: async (req, reply) => {
      const scope = await resolveScope(container, req);
      await container.auth.deleteApiKey(req.headers, scope.authOrgId, req.params.id);
      return reply.code(204).send();
    },
  });
}
