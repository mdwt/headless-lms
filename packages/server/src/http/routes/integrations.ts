// HTTP routes for integrations (an org's connections to external services).
// Credentials are write-only: accepted on connect/reconnect, never present in a
// response — `toApi` strips the credentialRef so not even the reference leaks.
import type { FastifyInstance } from 'fastify';
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
import { resolveActor } from '../scope.js';
import { describeOperation } from '../operations.js';

function toApi(connection: DomainConnection): Connection {
  const { credentialRef: _credentialRef, ...rest } = connection;
  return rest;
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
    config: { operation: 'integrations.available' },
    schema: {
      operationId: 'listAvailableIntegrations',
      tags,
      summary: 'List the integrations this deployment supports',
      description: `${describeOperation('integrations.available')} Each with the JSON Schemas of its config, its secrets and its actions.`,
      response: { 200: AvailableIntegrationsList, ...refusals(403) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return integrations.available(actor);
    },
  });

  r.route({
    method: 'GET',
    url: '/api/integrations',
    config: { operation: 'integrations.list' },
    schema: {
      operationId: 'listConnections',
      tags,
      summary: "List the organization's integration connections",
      description: `${describeOperation('integrations.list')} Secrets are never returned.`,
      response: { 200: ConnectionsList, ...refusals(403) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return (await integrations.list(actor)).map(toApi);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/integrations',
    config: { operation: 'integrations.connect' },
    schema: {
      operationId: 'connectIntegration',
      tags,
      summary: 'Connect an integration',
      description: `${describeOperation('integrations.connect')} Stores the secrets encrypted; they are never returned. 400 when the integration is unknown or the config is invalid; 409 when the organization already has a connection to it.`,
      body: ConnectRequest,
      response: { 201: Connection, ...refusals(400, 403, 409) },
    },
    handler: async (req, reply) => {
      const actor = await resolveActor(container, req);
      const connection = await integrations.connect(req.body, actor);
      return reply.code(201).send(toApi(connection));
    },
  });

  r.route({
    method: 'GET',
    url: '/api/integrations/:id',
    config: { operation: 'integrations.get' },
    schema: {
      operationId: 'getConnection',
      tags,
      summary: 'Get a connection',
      description: `${describeOperation('integrations.get')} Secrets are never returned.`,
      params: ConnectionIdParam,
      response: { 200: Connection, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      const connection = await integrations.get(req.params.id, actor);
      if (!connection) {
        throw new NotFoundError('Connection', req.params.id);
      }
      return toApi(connection);
    },
  });

  r.route({
    method: 'PATCH',
    url: '/api/integrations/:id',
    config: { operation: 'integrations.configure' },
    schema: {
      operationId: 'configureConnection',
      tags,
      summary: "Change a connection's configuration or active flag",
      description: `${describeOperation('integrations.configure')} 400 when the config is invalid for the integration.`,
      params: ConnectionIdParam,
      body: ConfigureRequest,
      response: { 200: Connection, ...refusals(400, 403, 404) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      const connection = await integrations.configure(req.params.id, req.body, actor);
      if (!connection) {
        throw new NotFoundError('Connection', req.params.id);
      }
      return toApi(connection);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/integrations/:id/reconnect',
    config: { operation: 'integrations.reconnect' },
    schema: {
      operationId: 'reconnectIntegration',
      tags,
      summary: "Replace a connection's secrets",
      description: `${describeOperation('integrations.reconnect')} The new secrets replace the stored ones.`,
      params: ConnectionIdParam,
      body: ReconnectRequest,
      response: { 200: Connection, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      const connection = await integrations.reconnect(req.params.id, req.body.secrets, actor);
      if (!connection) {
        throw new NotFoundError('Connection', req.params.id);
      }
      return toApi(connection);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/integrations/:id/actions/:actionId',
    config: { operation: 'integrations.invoke' },
    schema: {
      operationId: 'invokeConnectionAction',
      tags,
      summary: "Invoke one of a connection's actions",
      description: `${describeOperation('integrations.invoke')} Runs the action, such as a listing that feeds a picker, with \`input\` checked against its input schema. 400 when the action fails or rejects the input; 404 when the connection or action does not exist; 409 when the connection is inactive.`,
      params: ConnectionActionParams,
      body: InvokeActionRequest,
      response: { 200: ActionInvocationResult, ...refusals(400, 403, 404, 409) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      const output = await integrations.invoke(
        req.params.id,
        req.params.actionId,
        req.body.input ?? {},
        actor,
      );
      return { output: output as Record<string, unknown> };
    },
  });

  r.route({
    method: 'DELETE',
    url: '/api/integrations/:id',
    config: { operation: 'integrations.disconnect' },
    schema: {
      operationId: 'disconnectIntegration',
      tags,
      summary: 'Disconnect an integration',
      description: `${describeOperation('integrations.disconnect')} Destroys its stored secrets.`,
      params: ConnectionIdParam,
      response: { 204: z.void(), ...refusals(403, 404) },
    },
    handler: async (req, reply) => {
      const actor = await resolveActor(container, req);
      const removed = await integrations.disconnect(req.params.id, actor);
      if (!removed) {
        throw new NotFoundError('Connection', req.params.id);
      }
      return reply.code(204).send();
    },
  });
}
