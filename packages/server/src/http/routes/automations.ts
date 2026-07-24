// HTTP routes for the automations context: rules that match a trigger (a
// domain event type) against enabled automations and run an ordered list of
// actions, plus the run history each automation accumulates.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  Automation,
  AutomationIdParam,
  AutomationRunsPage,
  AutomationRunsQuery,
  AutomationsAvailable,
  CreateAutomationBody,
  ErrorBody,
  UpdateAutomationBody,
} from '@headless-lms/api-contract';
import { NotFoundError } from '../../core/shared/errors.js';
import type { Container } from '../../app/container.js';
import { resolveScope } from '../scope.js';

export async function automationsRoutes(app: FastifyInstance, container: Container): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const automations = container.automations;
  const tags = ['Automations'];

  r.route({
    method: 'GET',
    url: '/api/automations',
    preHandler: app.requireSession,
    schema: {
      operationId: 'listAutomations',
      tags,
      summary: 'List automations',
      response: { 200: z.array(Automation) },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return automations.list(scope.orgId);
    },
  });

  // Registered before `/api/automations/:id` — otherwise `:id` would swallow
  // this path segment.
  r.route({
    method: 'GET',
    url: '/api/automations/available',
    preHandler: app.requireSession,
    schema: {
      operationId: 'getAvailableAutomations',
      tags,
      summary: 'List the triggers/actions automations can be built from',
      response: { 200: AutomationsAvailable },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return automations.available(scope.orgId);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/automations',
    preHandler: app.requireSession,
    schema: {
      operationId: 'createAutomation',
      tags,
      summary: 'Create an automation',
      body: CreateAutomationBody,
      response: { 201: Automation },
    },
    handler: async (req, reply) => {
      const scope = await resolveScope(container, req);
      const automation = await automations.create(scope.orgId, req.body);
      return reply.code(201).send(automation);
    },
  });

  r.route({
    method: 'GET',
    url: '/api/automations/:id',
    preHandler: app.requireSession,
    schema: {
      operationId: 'getAutomation',
      tags,
      summary: 'Get an automation by id',
      params: AutomationIdParam,
      response: { 200: Automation, 404: ErrorBody },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      const automation = await automations.get(scope.orgId, req.params.id);
      if (!automation) {
        throw new NotFoundError('Automation', req.params.id);
      }
      return automation;
    },
  });

  r.route({
    method: 'PATCH',
    url: '/api/automations/:id',
    preHandler: app.requireSession,
    schema: {
      operationId: 'updateAutomation',
      tags,
      summary: 'Update an automation',
      params: AutomationIdParam,
      body: UpdateAutomationBody,
      response: { 200: Automation, 404: ErrorBody },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      const automation = await automations.update(scope.orgId, req.params.id, req.body);
      if (!automation) {
        throw new NotFoundError('Automation', req.params.id);
      }
      return automation;
    },
  });

  r.route({
    method: 'DELETE',
    url: '/api/automations/:id',
    preHandler: app.requireSession,
    schema: {
      operationId: 'deleteAutomation',
      tags,
      summary: 'Delete an automation',
      params: AutomationIdParam,
      response: { 204: z.void(), 404: ErrorBody },
    },
    handler: async (req, reply) => {
      const scope = await resolveScope(container, req);
      const deleted = await automations.delete(scope.orgId, req.params.id);
      if (!deleted) {
        throw new NotFoundError('Automation', req.params.id);
      }
      return reply.code(204).send();
    },
  });

  r.route({
    method: 'GET',
    url: '/api/automations/:id/runs',
    preHandler: app.requireSession,
    schema: {
      operationId: 'listAutomationRuns',
      tags,
      summary: "List an automation's runs",
      params: AutomationIdParam,
      querystring: AutomationRunsQuery,
      response: { 200: AutomationRunsPage, 404: ErrorBody },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      const automation = await automations.get(scope.orgId, req.params.id);
      if (!automation) {
        throw new NotFoundError('Automation', req.params.id);
      }
      const page = await automations.listRuns(scope.orgId, req.params.id, req.query);
      // DomainEvent has no index signature (a closed, typed interface); the
      // contract models the run's event snapshot loosely (z.record) since its
      // shape varies per trigger — cast at the boundary.
      return {
        ...page,
        rows: page.rows.map((run) => ({
          ...run,
          event: run.event as unknown as Record<string, unknown>,
        })),
      };
    },
  });
}
