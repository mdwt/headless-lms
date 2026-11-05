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
import { resolveActor } from '../scope.js';
import { describeOperation } from '../operations.js';

const DELIVERY_DESCRIPTION =
  "`url` must be a public address: localhost and private network addresses are refused when saved and when delivering. Each subscribed event is POSTed to `url` as the JSON event envelope (`id`, `type`, `version`, `orgId`, `occurredAt`, `data`), signed per the Standard Webhooks spec: `webhook-id` (the event id, stable across retries), `webhook-timestamp` (unix seconds) and `webhook-signature` (`v1,` + base64 HMAC-SHA256 of `{webhook-id}.{webhook-timestamp}.{body}`, keyed with the base64-decoded part of the `whsec_` secret). Any non-2xx response or timeout is a failed attempt and is retried. Deliveries are the webhook's automation runs: `GET /api/automations/{id}/runs`.";

export async function webhooksRoutes(app: FastifyInstance, container: Container): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const automations = container.automations;
  const tags = ['Automations'];

  r.route({
    method: 'GET',
    url: '/api/automations/webhooks',
    config: { operation: 'automations.listWebhooks' },
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'listWebhooks',
      tags,
      summary: "List the organization's webhooks",
      description: `${describeOperation('automations.listWebhooks')} Signing secrets are not included.`,
      response: { 200: z.array(Webhook), ...refusals(403) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return automations.listWebhooks(actor);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/automations/webhooks',
    config: { operation: 'automations.createWebhook' },
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'createWebhook',
      tags,
      summary: 'Create a webhook',
      description: `${describeOperation('automations.createWebhook')} ${DELIVERY_DESCRIPTION}`,
      body: CreateWebhookBody,
      response: { 201: CreatedWebhook, ...refusals(400, 403) },
    },
    handler: async (req, reply) => {
      const actor = await resolveActor(container, req);
      const webhook = await automations.createWebhook(req.body, actor);
      return reply.code(201).send(webhook);
    },
  });

  r.route({
    method: 'GET',
    url: '/api/automations/webhooks/:id',
    config: { operation: 'automations.getWebhook' },
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'getWebhook',
      tags,
      summary: 'Get a webhook',
      description: `${describeOperation('automations.getWebhook')} The signing secret is not included.`,
      params: AutomationIdParam,
      response: { 200: Webhook, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      const webhook = await automations.getWebhook(req.params.id, actor);
      if (!webhook) {
        throw new NotFoundError('Webhook', req.params.id);
      }
      return webhook;
    },
  });

  r.route({
    method: 'PATCH',
    url: '/api/automations/webhooks/:id',
    config: { operation: 'automations.updateWebhook' },
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'updateWebhook',
      tags,
      summary: "Change a webhook's URL, events, description or enabled flag",
      description: `${describeOperation('automations.updateWebhook')} Changes only the fields sent. 400 when an event is reserved or unknown.`,
      params: AutomationIdParam,
      body: UpdateWebhookBody,
      response: { 200: Webhook, ...refusals(400, 403, 404) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      const webhook = await automations.updateWebhook(req.params.id, req.body, actor);
      if (!webhook) {
        throw new NotFoundError('Webhook', req.params.id);
      }
      return webhook;
    },
  });

  r.route({
    method: 'DELETE',
    url: '/api/automations/webhooks/:id',
    config: { operation: 'automations.deleteWebhook' },
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'deleteWebhook',
      tags,
      summary: 'Delete a webhook and its signing secret',
      description: `${describeOperation('automations.deleteWebhook')} Its delivery history is kept.`,
      params: AutomationIdParam,
      response: { 204: z.void(), ...refusals(403, 404) },
    },
    handler: async (req, reply) => {
      const actor = await resolveActor(container, req);
      const deleted = await automations.deleteWebhook(req.params.id, actor);
      if (!deleted) {
        throw new NotFoundError('Webhook', req.params.id);
      }
      return reply.code(204).send();
    },
  });

  r.route({
    method: 'GET',
    url: '/api/automations/webhooks/:id/secret',
    config: { operation: 'automations.revealWebhookSecret' },
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'getWebhookSecret',
      tags,
      summary: "Reveal a webhook's signing secret",
      description: describeOperation('automations.revealWebhookSecret'),
      params: AutomationIdParam,
      response: { 200: WebhookSecret, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      const secret = await automations.revealWebhookSecret(req.params.id, actor);
      if (!secret) {
        throw new NotFoundError('Webhook', req.params.id);
      }
      return secret;
    },
  });

  r.route({
    method: 'POST',
    url: '/api/automations/webhooks/:id/secret/rotate',
    config: { operation: 'automations.rotateWebhookSecret' },
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'rotateWebhookSecret',
      tags,
      summary: "Replace a webhook's signing secret",
      description: `${describeOperation('automations.rotateWebhookSecret')} The old secret stops working immediately.`,
      params: AutomationIdParam,
      response: { 200: WebhookSecret, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      const secret = await automations.rotateWebhookSecret(req.params.id, actor);
      if (!secret) {
        throw new NotFoundError('Webhook', req.params.id);
      }
      return secret;
    },
  });
}
