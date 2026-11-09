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
import type { Container } from '../../app/container.js';
import { resolveActor } from '../scope.js';

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
    schema: {
      operationId: 'listAvailableIntegrations',
      tags,
      summary: 'List the integrations this deployment supports',
      description: `Requires \`integrations:read\`. Each with the JSON Schemas of its config, its secrets and its actions.`,
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
    schema: {
      operationId: 'listConnections',
      tags,
      summary: "List the organization's integration connections",
      description: `Requires \`integrations:read\`. Secrets are never returned.`,
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
    schema: {
      operationId: 'connectIntegration',
      tags,
      summary: 'Connect an integration',
      description: `Requires \`integrations:write\`. Stores the secrets encrypted; they are never returned. 400 when the integration is unknown or the config is invalid; 409 when the organization already has a connection to it.`,
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
    schema: {
      operationId: 'getConnection',
      tags,
      summary: 'Get a connection',
      description: `Requires \`integrations:read\`. Secrets are never returned.`,
      params: ConnectionIdParam,
      response: { 200: Connection, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return toApi(await integrations.get(req.params.id, actor));
    },
  });

  r.route({
    method: 'PATCH',
    url: '/api/integrations/:id',
    schema: {
      operationId: 'configureConnection',
      tags,
      summary: "Change a connection's configuration or active flag",
      description: `Requires \`integrations:write\`. 400 when the config is invalid for the integration.`,
      params: ConnectionIdParam,
      body: ConfigureRequest,
      response: { 200: Connection, ...refusals(400, 403, 404) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return toApi(await integrations.configure(req.params.id, req.body, actor));
    },
  });

  r.route({
    method: 'POST',
    url: '/api/integrations/:id/reconnect',
    schema: {
      operationId: 'reconnectIntegration',
      tags,
      summary: "Replace a connection's secrets",
      description: `Requires \`integrations:write\`. The new secrets replace the stored ones.`,
      params: ConnectionIdParam,
      body: ReconnectRequest,
      response: { 200: Connection, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return toApi(await integrations.reconnect(req.params.id, req.body.secrets, actor));
    },
  });

  r.route({
    method: 'POST',
    url: '/api/integrations/:id/actions/:actionId',
    schema: {
      operationId: 'invokeConnectionAction',
      tags,
      summary: "Invoke one of a connection's actions",
      description: `Requires \`integrations:write\`. Runs the action, such as a listing that feeds a picker, with \`input\` checked against its input schema. 400 when the action fails or rejects the input; 404 when the connection or action does not exist; 409 when the connection is inactive.`,
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
    schema: {
      operationId: 'disconnectIntegration',
      tags,
      summary: 'Disconnect an integration',
      description: `Requires \`integrations:delete\`. Destroys its stored secrets.`,
      params: ConnectionIdParam,
      response: { 204: z.void(), ...refusals(403, 404) },
    },
    handler: async (req, reply) => {
      const actor = await resolveActor(container, req);
      await integrations.disconnect(req.params.id, actor);
      return reply.code(204).send();
    },
  });
}
