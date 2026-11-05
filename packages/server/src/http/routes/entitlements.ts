// HTTP routes for the entitlements context (a student's access grant to a piece of content).
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  Entitlement,
  EntitlementIdParam,
  EntitlementsPage,
  EntitlementsQuery,
  GrantEntitlement,
  SetEntitlementStatus,
  refusals,
} from '../schemas/index.js';
import { NotFoundError } from '@headless-lms/core/shared/errors';
import type { Container } from '../../app/container.js';
import { resolveActor } from '../scope.js';
import { describeOperation } from '../operations.js';

export async function entitlementsRoutes(
  app: FastifyInstance,
  container: Container,
): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const entitlements = container.entitlements;

  r.route({
    method: 'GET',
    url: '/api/entitlements',
    config: { operation: 'entitlements.list' },
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'listEntitlements',
      tags: ['Entitlements'],
      summary: 'List entitlements',
      description: `${describeOperation('entitlements.list')} \`access:read\` lists every grant; \`progress:read\` on a course lists that course's grants when \`contentId\` names it.`,
      querystring: EntitlementsQuery,
      response: { 200: EntitlementsPage, ...refusals(403) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return entitlements.list(req.query, actor);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/entitlements',
    config: { operation: 'entitlements.grant' },
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'grantEntitlement',
      tags: ['Entitlements'],
      summary: 'Grant a person access to content or a bundle',
      description: `${describeOperation('entitlements.grant')} Name exactly one of \`contentId\` and \`bundleId\`. A bundle grant covers whatever the bundle holds, now and later.`,
      body: GrantEntitlement,
      response: { 201: Entitlement, ...refusals(403, 409) },
    },
    handler: async (req, reply) => {
      const actor = await resolveActor(container, req);
      const entitlement = await entitlements.grant(req.body, actor);
      return reply.code(201).send(entitlement);
    },
  });

  r.route({
    method: 'PATCH',
    url: '/api/entitlements/:id',
    config: { operation: 'entitlements.setStatus' },
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'setEntitlementStatus',
      tags: ['Entitlements'],
      summary: 'Revoke or reinstate an entitlement',
      description: `${describeOperation('entitlements.setStatus')} Access follows the status at once.`,
      params: EntitlementIdParam,
      body: SetEntitlementStatus,
      response: { 200: Entitlement, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      const entitlement = await entitlements.setStatus(req.params.id, req.body.status, actor);
      if (!entitlement) {
        throw new NotFoundError('Entitlement', req.params.id);
      }
      return entitlement;
    },
  });
}
