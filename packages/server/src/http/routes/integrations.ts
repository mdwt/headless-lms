// HTTP routes for integrations (an org's connections to external services).
// All require a session with an active organization. Credentials are
// write-only: accepted on connect/reconnect, never present in a response —
// `toApi` strips the credentialRef so not even the reference leaks.
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  ActionInvocationResult,
  AvailableIntegrationsList,
  ConfigureRequest,
  ConnectRequest,
  Connection,
  ConnectionActionParams,
  ConnectionIdParam,
  ConnectionsList,
  InvokeActionRequest,
  ReconnectRequest,
  refusals,
} from '../schemas/index.js';
import type { Connection as DomainConnection } from '@headless-lms/core/integrations';
import { NotFoundError } from '@headless-lms/core/shared/errors';
import type { Container } from '../../app/container.js';
import { resolveScope } from '../scope.js';

function toApi(connection: DomainConnection): Connection {
  const { credentialRef: _credentialRef, ...rest } = connection;
  return rest;
}

/** Resolve the session's active org to the domain org id, or 400 and return null. */
async function resolveOrgId(req: FastifyRequest, reply: FastifyReply): Promise<string | null> {
  if (!req.orgId) {
    await reply.code(400).send({ error: 'no_active_org', message: 'No active organization' });
    return null;
  }
  return req.orgId;
}

export async function integrationsRoutes(
  app: FastifyInstance,
  container: Container,
): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const integrations = container.integrations;
  const tags = ['Integrations'];
  const staff = async (req: FastifyRequest) => {
    await resolveScope(container, req);
  };

  r.route({
    method: 'GET',
    url: '/api/integrations/available',
    preHandler: staff,
    schema: {
      operationId: 'listAvailableIntegrations',
      tags,
      summary: 'List the integrations this deployment supports (staff)',
      description:
        'Staff only (owner, admin, instructor). Each with the JSON Schemas of its config, its secrets and its actions.',
      response: { 200: AvailableIntegrationsList, ...refusals(403) },
    },
    handler: async () => integrations.available(),
  });

  r.route({
    method: 'GET',
    url: '/api/integrations',
    preHandler: staff,
    schema: {
      operationId: 'listConnections',
      tags,
      summary: "List the organization's integration connections (staff)",
      description: 'Staff only (owner, admin, instructor). Secrets are never returned.',
      response: { 200: ConnectionsList, ...refusals(403) },
    },
    handler: async (req, reply) => {
      const orgId = await resolveOrgId(req, reply);
      if (!orgId) {
        return;
      }
      return (await integrations.list(orgId)).map(toApi);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/integrations',
    preHandler: staff,
    schema: {
      operationId: 'connectIntegration',
      tags,
      summary: 'Connect an integration (staff)',
      description:
        'Staff only (owner, admin, instructor). Stores the secrets encrypted; they are never returned. 400 when the integration is unknown or the config is invalid; 409 when the organization already has a connection to it.',
      body: ConnectRequest,
      response: { 201: Connection, ...refusals(400, 403, 409) },
    },
    handler: async (req, reply) => {
      const orgId = await resolveOrgId(req, reply);
      if (!orgId) {
        return;
      }
      const connection = await integrations.connect(orgId, req.body);
      return reply.code(201).send(toApi(connection));
    },
  });

  r.route({
    method: 'GET',
    url: '/api/integrations/:id',
    preHandler: staff,
    schema: {
      operationId: 'getConnection',
      tags,
      summary: 'Get a connection (staff)',
      description: 'Staff only (owner, admin, instructor). Secrets are never returned.',
      params: ConnectionIdParam,
      response: { 200: Connection, ...refusals(403, 404) },
    },
    handler: async (req, reply) => {
      const orgId = await resolveOrgId(req, reply);
      if (!orgId) {
        return;
      }
      const connection = await integrations.get(orgId, req.params.id);
      if (!connection) {
        throw new NotFoundError('Connection', req.params.id);
      }
      return toApi(connection);
    },
  });

  r.route({
    method: 'PATCH',
    url: '/api/integrations/:id',
    preHandler: staff,
    schema: {
      operationId: 'configureConnection',
      tags,
      summary: "Change a connection's configuration or active flag (staff)",
      description:
        'Staff only (owner, admin, instructor). 400 when the config is invalid for the integration.',
      params: ConnectionIdParam,
      body: ConfigureRequest,
      response: { 200: Connection, ...refusals(400, 403, 404) },
    },
    handler: async (req, reply) => {
      const orgId = await resolveOrgId(req, reply);
      if (!orgId) {
        return;
      }
      const connection = await integrations.configure(orgId, req.params.id, req.body);
      if (!connection) {
        throw new NotFoundError('Connection', req.params.id);
      }
      return toApi(connection);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/integrations/:id/reconnect',
    preHandler: staff,
    schema: {
      operationId: 'reconnectIntegration',
      tags,
      summary: "Replace a connection's secrets (staff)",
      description:
        'Staff only (owner, admin, instructor). The new secrets replace the stored ones.',
      params: ConnectionIdParam,
      body: ReconnectRequest,
      response: { 200: Connection, ...refusals(403, 404) },
    },
    handler: async (req, reply) => {
      const orgId = await resolveOrgId(req, reply);
      if (!orgId) {
        return;
      }
      const connection = await integrations.reconnect(orgId, req.params.id, req.body.secrets);
      if (!connection) {
        throw new NotFoundError('Connection', req.params.id);
      }
      return toApi(connection);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/integrations/:id/actions/:actionId',
    preHandler: staff,
    schema: {
      operationId: 'invokeConnectionAction',
      tags,
      summary: "Invoke one of a connection's actions (staff)",
      description:
        'Staff only (owner, admin, instructor). Runs the action, such as a listing that feeds a picker, with `input` checked against its input schema. 400 when the action fails or rejects the input; 404 when the connection or action does not exist; 409 when the connection is inactive.',
      params: ConnectionActionParams,
      body: InvokeActionRequest,
      response: { 200: ActionInvocationResult, ...refusals(400, 403, 404, 409) },
    },
    handler: async (req, reply) => {
      const orgId = await resolveOrgId(req, reply);
      if (!orgId) {
        return;
      }
      const output = await integrations.invoke(
        orgId,
        req.params.id,
        req.params.actionId,
        req.body.input ?? {},
      );
      return { output: output as Record<string, unknown> };
    },
  });

  r.route({
    method: 'DELETE',
    url: '/api/integrations/:id',
    preHandler: staff,
    schema: {
      operationId: 'disconnectIntegration',
      tags,
      summary: 'Disconnect an integration (staff)',
      description: 'Staff only (owner, admin, instructor). Destroys its stored secrets.',
      params: ConnectionIdParam,
      response: { 204: z.void(), ...refusals(403, 404) },
    },
    handler: async (req, reply) => {
      const orgId = await resolveOrgId(req, reply);
      if (!orgId) {
        return;
      }
      const removed = await integrations.disconnect(orgId, req.params.id);
      if (!removed) {
        throw new NotFoundError('Connection', req.params.id);
      }
      return reply.code(204).send();
    },
  });
}
