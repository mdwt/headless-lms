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
import type { Container } from '../../app/container.js';
import { resolveActor } from '../scope.js';

export async function entitlementsRoutes(
  app: FastifyInstance,
  container: Container,
): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const entitlements = container.entitlements;

  r.route({
    method: 'GET',
    url: '/api/entitlements',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'listEntitlements',
      tags: ['Entitlements'],
      summary: 'List entitlements',
      description: `Requires one of \`access:read\`, \`progress:read\`. \`access:read\` lists every grant; \`progress:read\` on a course lists that course's grants when \`contentId\` names it.`,
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
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'grantEntitlement',
      tags: ['Entitlements'],
      summary: 'Grant a person access to content or a bundle',
      description: `Requires \`access:write\`; to grant an event, \`events:write\` on it is enough. Name exactly one of \`contentId\` and \`bundleId\`. A bundle grant covers whatever the bundle holds, now and later. Granting again makes a revoked or expired grant active with the new expiry. A grant to an event needs it published and not ended, with a place left when it has a capacity: 409 \`not_published\`, \`ended\` or \`full\` otherwise; granting it to someone who already holds it changes nothing. 404 when the content or the person does not exist.`,
      body: GrantEntitlement,
      response: { 201: Entitlement, ...refusals(403, 404, 409) },
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
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'setEntitlementStatus',
      tags: ['Entitlements'],
      summary: 'Revoke or reinstate an entitlement',
      description: `Requires \`access:write\`. Access follows the status at once.`,
      params: EntitlementIdParam,
      body: SetEntitlementStatus,
      response: { 200: Entitlement, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return entitlements.setStatus(req.params.id, req.body.status, actor);
    },
  });
}
