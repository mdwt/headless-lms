// HTTP routes for the entitlements context (a student's access grant to a piece of content).
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  Entitlement,
  EntitlementIdParam,
  EntitlementsPage,
  EntitlementsQuery,
  ErrorBody,
  GrantEntitlement,
  SetEntitlementStatus,
} from '@headless-lms/api-contract';
import { NotFoundError } from '../../core/shared/errors.js';
import type { Container } from '../../composition/container.js';
import { resolveScope } from '../scope.js';

export async function entitlementsRoutes(
  app: FastifyInstance,
  container: Container,
): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const entitlements = container.entitlements;

  r.route({
    method: 'GET',
    url: '/api/entitlements',
    preHandler: app.requireSession,
    schema: {
      operationId: 'listEntitlements',
      tags: ['Entitlements'],
      summary: 'List entitlements',
      querystring: EntitlementsQuery,
      response: { 200: EntitlementsPage },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return entitlements.list(scope.orgId, req.query);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/entitlements',
    preHandler: app.requireSession,
    schema: {
      operationId: 'grantEntitlement',
      tags: ['Entitlements'],
      summary: 'Grant a student access to a piece of content',
      body: GrantEntitlement,
      response: { 201: Entitlement },
    },
    handler: async (req, reply) => {
      const scope = await resolveScope(container, req);
      const entitlement = await entitlements.grant(scope.orgId, req.body);
      return reply.code(201).send(entitlement);
    },
  });

  r.route({
    method: 'PATCH',
    url: '/api/entitlements/:id',
    preHandler: app.requireSession,
    schema: {
      operationId: 'setEntitlementStatus',
      tags: ['Entitlements'],
      summary: 'Revoke or reinstate an entitlement',
      params: EntitlementIdParam,
      body: SetEntitlementStatus,
      response: { 200: Entitlement, 404: ErrorBody },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      const entitlement = await entitlements.setStatus(scope.orgId, req.params.id, req.body.status);
      if (!entitlement) {
        throw new NotFoundError('Entitlement', req.params.id);
      }
      return entitlement;
    },
  });
}
