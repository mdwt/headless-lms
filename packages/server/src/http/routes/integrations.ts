// HTTP routes for integrations (an org's connections to external services).
// All require a session with an active organization. Credentials are
// write-only: accepted on connect/reconnect, never present in a response —
// `toApi` strips the credentialRef so not even the reference leaks.
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  AvailableIntegrationsList,
  ConfigureRequest,
  ConnectRequest,
  Connection,
  ConnectionIdParam,
  ConnectionsList,
  ErrorBody,
  ReconnectRequest,
} from '@headless-lms/api-contract';
import type { Connection as DomainConnection } from '../../core/integrations/index.js';
import { NotFoundError } from '../../core/shared/errors.js';
import type { Container } from '../../app/container.js';

function toApi(connection: DomainConnection): Connection {
  const { credentialRef: _credentialRef, ...rest } = connection;
  return rest;
}

/** Resolve the session's active org to the domain org id, or 400 and return null. */
async function resolveOrgId(
  req: FastifyRequest,
  reply: FastifyReply,
  container: Container,
): Promise<string | null> {
  if (!req.orgId) {
    await reply.code(400).send({ error: 'no_active_org', message: 'No active organization' });
    return null;
  }
  const org = await container.organizations.getByExternalId(req.orgId);
  if (!org) {
    await reply.code(400).send({ error: 'no_active_org', message: 'Organization not provisioned' });
    return null;
  }
  return org.id;
}

export async function integrationsRoutes(
  app: FastifyInstance,
  container: Container,
): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const integrations = container.integrations;
  const tags = ['Integrations'];

  r.route({
    method: 'GET',
    url: '/api/integrations/available',
    preHandler: app.requireSession,
    schema: {
      operationId: 'listAvailableIntegrations',
      tags,
      summary: 'List the integrations this deployment supports, with their config schemas',
      response: { 200: AvailableIntegrationsList, 401: ErrorBody },
    },
    handler: async () => integrations.available(),
  });

  r.route({
    method: 'GET',
    url: '/api/integrations',
    preHandler: app.requireSession,
    schema: {
      operationId: 'listConnections',
      tags,
      summary: "List the organization's integration connections",
      response: { 200: ConnectionsList, 400: ErrorBody, 401: ErrorBody },
    },
    handler: async (req, reply) => {
      const orgId = await resolveOrgId(req, reply, container);
      if (!orgId) {
        return;
      }
      return (await integrations.list(orgId)).map(toApi);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/integrations',
    preHandler: app.requireSession,
    schema: {
      operationId: 'connectIntegration',
      tags,
      summary: 'Connect an integration (stores its secrets encrypted)',
      body: ConnectRequest,
      response: { 201: Connection, 400: ErrorBody, 401: ErrorBody, 409: ErrorBody },
    },
    handler: async (req, reply) => {
      const orgId = await resolveOrgId(req, reply, container);
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
    preHandler: app.requireSession,
    schema: {
      operationId: 'getConnection',
      tags,
      summary: 'Get a connection',
      params: ConnectionIdParam,
      response: { 200: Connection, 400: ErrorBody, 401: ErrorBody, 404: ErrorBody },
    },
    handler: async (req, reply) => {
      const orgId = await resolveOrgId(req, reply, container);
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
    preHandler: app.requireSession,
    schema: {
      operationId: 'configureConnection',
      tags,
      summary: "Change a connection's configuration or active flag",
      params: ConnectionIdParam,
      body: ConfigureRequest,
      response: { 200: Connection, 400: ErrorBody, 401: ErrorBody, 404: ErrorBody },
    },
    handler: async (req, reply) => {
      const orgId = await resolveOrgId(req, reply, container);
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
    preHandler: app.requireSession,
    schema: {
      operationId: 'reconnectIntegration',
      tags,
      summary: "Replace a connection's secrets (re-authenticate)",
      params: ConnectionIdParam,
      body: ReconnectRequest,
      response: { 200: Connection, 400: ErrorBody, 401: ErrorBody, 404: ErrorBody },
    },
    handler: async (req, reply) => {
      const orgId = await resolveOrgId(req, reply, container);
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
    method: 'DELETE',
    url: '/api/integrations/:id',
    preHandler: app.requireSession,
    schema: {
      operationId: 'disconnectIntegration',
      tags,
      summary: 'Disconnect an integration (destroys its stored secrets)',
      params: ConnectionIdParam,
      response: { 204: z.void(), 400: ErrorBody, 401: ErrorBody, 404: ErrorBody },
    },
    handler: async (req, reply) => {
      const orgId = await resolveOrgId(req, reply, container);
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
