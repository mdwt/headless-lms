// HTTP routes for the automations context: rules that match a trigger (a
// domain event type) against enabled automations and run an ordered list of
// actions, plus the run history each automation accumulates.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  Automation,
  AutomationIdParam,
  AutomationRun,
  AutomationRunParams,
  AutomationRunsPage,
  AutomationRunsQuery,
  AutomationsQuery,
  AvailableAction,
  AvailableTriggers,
  CreateAutomationBody,
  UpdateAutomationBody,
  refusals,
} from '../schemas/index.js';
import type { Container } from '../../app/container.js';
import { resolveActor } from '../scope.js';

export async function automationsRoutes(app: FastifyInstance, container: Container): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const automations = container.automations;
  const tags = ['Automations'];

  r.route({
    method: 'GET',
    url: '/api/automations',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'listAutomations',
      tags,
      summary: 'List automations',
      description: `Requires \`automations:read\`. Optionally only workflows or only webhooks.`,
      querystring: AutomationsQuery,
      response: { 200: z.array(Automation), ...refusals(403) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return automations.list(req.query, actor);
    },
  });

  // Before `/api/automations/:id` — otherwise `:id` would swallow these path segments.
  r.route({
    method: 'GET',
    url: '/api/automations/actions',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'listAutomationActions',
      tags,
      summary: 'List the actions automations can use',
      description: 'Requires `automations:read`.',
      response: { 200: z.array(AvailableAction), ...refusals(403) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return automations.availableActions(actor);
    },
  });

  r.route({
    method: 'GET',
    url: '/api/automations/triggers',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'listAutomationTriggers',
      tags,
      summary: 'List the domain events automations can react to',
      description: 'Requires `automations:read`.',
      response: { 200: AvailableTriggers, ...refusals(403) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return automations.availableTriggers(actor);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/automations',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'createAutomation',
      tags,
      summary: 'Create a workflow automation',
      description: `Requires \`automations:write\`. 400 when a trigger is reserved, not an event the system emits or an unsupported schedule, or an action is reserved for webhooks or no longer available.`,
      body: CreateAutomationBody,
      response: { 201: Automation, ...refusals(400, 403) },
    },
    handler: async (req, reply) => {
      const actor = await resolveActor(container, req);
      const automation = await automations.create(req.body, actor);
      return reply.code(201).send(automation);
    },
  });

  r.route({
    method: 'GET',
    url: '/api/automations/:id',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'getAutomation',
      tags,
      summary: 'Get an automation',
      description: `Requires \`automations:read\`. Workflows and webhooks alike.`,
      params: AutomationIdParam,
      response: { 200: Automation, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return automations.get(req.params.id, actor);
    },
  });

  r.route({
    method: 'PATCH',
    url: '/api/automations/:id',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'updateAutomation',
      tags,
      summary: 'Update a workflow automation',
      description: `Requires \`automations:write\`. Webhooks change through the webhook endpoints (409). 400 when a trigger is reserved, not an event the system emits or an unsupported schedule, or an action is reserved for webhooks or no longer available.`,
      params: AutomationIdParam,
      body: UpdateAutomationBody,
      response: { 200: Automation, ...refusals(400, 403, 404, 409) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return automations.update(req.params.id, req.body, actor);
    },
  });

  r.route({
    method: 'DELETE',
    url: '/api/automations/:id',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'deleteAutomation',
      tags,
      summary: 'Delete a workflow automation',
      description: `Requires \`automations:delete\`. Webhooks are deleted through the webhook endpoints (409). Its runs stay readable.`,
      params: AutomationIdParam,
      response: { 204: z.void(), ...refusals(403, 404, 409) },
    },
    handler: async (req, reply) => {
      const actor = await resolveActor(container, req);
      await automations.delete(req.params.id, actor);
      return reply.code(204).send();
    },
  });

  r.route({
    method: 'GET',
    url: '/api/automations/:id/runs',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'listAutomationRuns',
      tags,
      summary: "List an automation's runs",
      description: `Requires \`automations:read\`. A deleted automation's runs remain reachable as an audit trail, so an unknown id answers an empty page rather than 404. A run's event carries the fields a webhook delivery of that event would.`,
      params: AutomationIdParam,
      querystring: AutomationRunsQuery,
      response: { 200: AutomationRunsPage, ...refusals(403) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      // No existence pre-check: runs deliberately survive automation deletion (audit trail).
      return automations.listRuns(req.params.id, req.query, actor);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/automations/:id/runs/:runId/rerun',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'rerunAutomationRun',
      tags,
      summary: 'Run a finished run again',
      description: `Requires \`automations:write\`. Dispatches the same run again with the automation's current steps; the new outcome replaces the run's previous one. For a webhook this resends the delivery to its current URL. A run that is still running can't be rerun (409).`,
      params: AutomationRunParams,
      response: { 200: AutomationRun, ...refusals(403, 404, 409) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return automations.rerun(req.params.id, req.params.runId, actor);
    },
  });
}
