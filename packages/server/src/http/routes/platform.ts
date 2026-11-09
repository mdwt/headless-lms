import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { Container } from '../../app/container.js';
import {
  CreatedApiKey,
  CreatePlatformApiKey,
  CreatePlatformOrganization,
  PlatformOrganization,
  PlatformOrgIdParam,
  refusals,
} from '../schemas/index.js';

export async function platformRoutes(app: FastifyInstance, container: Container): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const tags = ['Platform'];
  const organizations = container.organizations;

  r.route({
    method: 'POST',
    url: '/api/platform/organizations',
    preHandler: app.requirePlatform,
    schema: {
      operationId: 'createPlatformOrganization',
      tags,
      summary: 'Create an organization and its first API key',
      description: `Requires the platform key as \`Authorization: Bearer <platform key>\`. Creates the organization, owned by the platform account, and an API key for the platform account with the Owner role and no expiry. The key is returned once. 409 when the slug is in use.`,
      body: CreatePlatformOrganization,
      response: { 201: PlatformOrganization, ...refusals(400, 409) },
    },
    handler: async (req, reply) => {
      const created = await organizations.createPlatformOrganization(req.body);
      return reply.code(201).send({
        organization: {
          ...created.organization,
          createdAt: created.organization.createdAt.toISOString(),
        },
        apiKey: created.apiKey,
      });
    },
  });

  r.route({
    method: 'POST',
    url: '/api/platform/organizations/:orgId/api-keys',
    preHandler: app.requirePlatform,
    schema: {
      operationId: 'createPlatformApiKey',
      tags,
      summary: 'Create another API key for an organization',
      description: `Requires the platform key as \`Authorization: Bearer <platform key>\`. Creates an API key for the platform account in the organization, with the Owner role and no expiry, to replace a lost or leaked one; revoke the old key with the new one. The key is returned once. 404 when the platform account is not an active member of the organization.`,
      params: PlatformOrgIdParam,
      body: CreatePlatformApiKey,
      response: { 201: CreatedApiKey, ...refusals(400, 404) },
    },
    handler: async (req, reply) => {
      const created = await organizations.createPlatformApiKey(req.params.orgId, req.body.name);
      return reply.code(201).send(created);
    },
  });
}
