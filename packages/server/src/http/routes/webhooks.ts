import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  AutomationIdParam,
  CreatedWebhook,
  CreateWebhookBody,
  UpdateWebhookBody,
  Webhook,
  WebhookSecret,
  refusals,
} from '../schemas/index.js';
import { NotFoundError } from '@headless-lms/core/shared/errors';
import type { Container } from '../../app/container.js';
import { resolveScope } from '../scope.js';

const DELIVERY_DESCRIPTION =
  "Staff only (owner, admin, instructor). `url` must be a public address: localhost and private network addresses are refused when saved and when delivering. Each subscribed event is POSTed to `url` as the JSON event envelope (`id`, `type`, `version`, `orgId`, `occurredAt`, `data`), signed per the Standard Webhooks spec: `webhook-id` (the event id, stable across retries), `webhook-timestamp` (unix seconds) and `webhook-signature` (`v1,` + base64 HMAC-SHA256 of `{webhook-id}.{webhook-timestamp}.{body}`, keyed with the base64-decoded part of the `whsec_` secret). Any non-2xx response or timeout is a failed attempt and is retried. Deliveries are the webhook's automation runs: `GET /api/automations/{id}/runs`.";

export async function webhooksRoutes(app: FastifyInstance, container: Container): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const automations = container.automations;
  const tags = ['Automations'];

  r.route({
    method: 'GET',
    url: '/api/automations/webhooks',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'listWebhooks',
      tags,
      summary: "List the organization's webhooks (staff)",
      description: 'Staff only (owner, admin, instructor). Signing secrets are not included.',
      response: { 200: z.array(Webhook), ...refusals(403) },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return automations.listWebhooks(scope.orgId);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/automations/webhooks',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'createWebhook',
      tags,
      summary: 'Create a webhook (staff)',
      description: DELIVERY_DESCRIPTION,
      body: CreateWebhookBody,
      response: { 201: CreatedWebhook, ...refusals(400, 403) },
    },
    handler: async (req, reply) => {
      const scope = await resolveScope(container, req);
      const webhook = await automations.createWebhook(scope.orgId, req.body);
      return reply.code(201).send(webhook);
    },
  });

  r.route({
    method: 'GET',
    url: '/api/automations/webhooks/:id',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'getWebhook',
      tags,
      summary: 'Get a webhook (staff)',
      description: 'Staff only (owner, admin, instructor). The signing secret is not included.',
      params: AutomationIdParam,
      response: { 200: Webhook, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      const webhook = await automations.getWebhook(scope.orgId, req.params.id);
      if (!webhook) {
        throw new NotFoundError('Webhook', req.params.id);
      }
      return webhook;
    },
  });

  r.route({
    method: 'PATCH',
    url: '/api/automations/webhooks/:id',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'updateWebhook',
      tags,
      summary: "Change a webhook's URL, events, description or enabled flag (staff)",
      description:
        'Staff only (owner, admin, instructor). Changes only the fields sent. 400 when an event is reserved or unknown.',
      params: AutomationIdParam,
      body: UpdateWebhookBody,
      response: { 200: Webhook, ...refusals(400, 403, 404) },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      const webhook = await automations.updateWebhook(scope.orgId, req.params.id, req.body);
      if (!webhook) {
        throw new NotFoundError('Webhook', req.params.id);
      }
      return webhook;
    },
  });

  r.route({
    method: 'DELETE',
    url: '/api/automations/webhooks/:id',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'deleteWebhook',
      tags,
      summary: 'Delete a webhook and its signing secret (staff)',
      description: 'Staff only (owner, admin, instructor). Its delivery history is kept.',
      params: AutomationIdParam,
      response: { 204: z.void(), ...refusals(403, 404) },
    },
    handler: async (req, reply) => {
      const scope = await resolveScope(container, req);
      const deleted = await automations.deleteWebhook(scope.orgId, req.params.id);
      if (!deleted) {
        throw new NotFoundError('Webhook', req.params.id);
      }
      return reply.code(204).send();
    },
  });

  r.route({
    method: 'GET',
    url: '/api/automations/webhooks/:id/secret',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'getWebhookSecret',
      tags,
      summary: "Reveal a webhook's signing secret (staff)",
      description: 'Staff only (owner, admin, instructor).',
      params: AutomationIdParam,
      response: { 200: WebhookSecret, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      const secret = await automations.revealWebhookSecret(scope.orgId, req.params.id);
      if (!secret) {
        throw new NotFoundError('Webhook', req.params.id);
      }
      return secret;
    },
  });

  r.route({
    method: 'POST',
    url: '/api/automations/webhooks/:id/secret/rotate',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'rotateWebhookSecret',
      tags,
      summary: "Replace a webhook's signing secret (staff)",
      description:
        'Staff only (owner, admin, instructor). The old secret stops working immediately.',
      params: AutomationIdParam,
      response: { 200: WebhookSecret, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      const secret = await automations.rotateWebhookSecret(scope.orgId, req.params.id);
      if (!secret) {
        throw new NotFoundError('Webhook', req.params.id);
      }
      return secret;
    },
  });
}
