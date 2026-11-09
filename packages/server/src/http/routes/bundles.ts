// HTTP routes for bundles — named groupings of content items. Request +
// response are validated against the shared contract schemas by the Zod type
// provider, and @fastify/swagger reads the same schemas to build the OpenAPI
// spec.
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  AddBundleItem,
  Bundle,
  BundleIdParam,
  BundleItem,
  BundleItemParams,
  BundlesPage,
  BundlesQuery,
  CreateBundle,
  UpdateBundle,
  refusals,
} from '../schemas/index.js';
import { z } from 'zod';
import type { Container } from '../../app/container.js';
import { resolveActor } from '../scope.js';

export async function bundlesRoutes(app: FastifyInstance, container: Container): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const content = container.content;

  r.route({
    method: 'GET',
    url: '/api/bundles',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'listBundles',
      tags: ['Content'],
      summary: 'List bundles',
      description: 'Requires `bundles:read`.',
      querystring: BundlesQuery,
      response: { 200: BundlesPage, ...refusals(403) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return content.listBundles(req.query, actor);
    },
  });

  r.route({
    method: 'GET',
    url: '/api/bundles/:bundleId',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'getBundle',
      tags: ['Content'],
      summary: 'Get a bundle',
      description: 'Requires `bundles:read`.',
      params: BundleIdParam,
      response: { 200: Bundle, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return content.getBundle(req.params.bundleId, actor);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/bundles',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'createBundle',
      tags: ['Content'],
      summary: 'Create a bundle, optionally with initial content',
      description: `Requires \`bundles:write\`. 404 when an initial content id is unknown.`,
      body: CreateBundle,
      response: { 201: Bundle, ...refusals(403, 404) },
    },
    handler: async (req, reply) => {
      const actor = await resolveActor(container, req);
      const bundle = await content.createBundle(req.body, actor);
      return reply.code(201).send(bundle);
    },
  });

  r.route({
    method: 'PATCH',
    url: '/api/bundles/:bundleId',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'updateBundle',
      tags: ['Content'],
      summary: 'Rename a bundle',
      description: 'Requires `bundles:write`.',
      params: BundleIdParam,
      body: UpdateBundle,
      response: { 200: Bundle, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return content.updateBundle(req.params.bundleId, req.body, actor);
    },
  });

  r.route({
    method: 'DELETE',
    url: '/api/bundles/:bundleId',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'deleteBundle',
      tags: ['Content'],
      summary: 'Delete a bundle',
      description: `Requires \`bundles:delete\`. Its content survives; access granted through the bundle ends.`,
      params: BundleIdParam,
      response: { 204: z.void(), ...refusals(403, 404) },
    },
    handler: async (req, reply) => {
      const actor = await resolveActor(container, req);
      await content.deleteBundle(req.params.bundleId, actor);
      return reply.code(204).send();
    },
  });

  r.route({
    method: 'GET',
    url: '/api/bundles/:bundleId/items',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'listBundleItems',
      tags: ['Content'],
      summary: "List a bundle's content",
      description: 'Requires `bundles:read`.',
      params: BundleIdParam,
      response: { 200: z.array(BundleItem), ...refusals(403) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return content.listBundleItems(req.params.bundleId, actor);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/bundles/:bundleId/items',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'addBundleItem',
      tags: ['Content'],
      summary: 'Add content to a bundle',
      description: `Requires \`bundles:write\`. Everyone who holds the bundle can open the content from then on. Returns the bundle's content.`,
      params: BundleIdParam,
      body: AddBundleItem,
      response: { 200: z.array(BundleItem), ...refusals(403, 404) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return content.addBundleItem(req.params.bundleId, req.body.contentId, actor);
    },
  });

  r.route({
    method: 'DELETE',
    url: '/api/bundles/:bundleId/items/:contentId',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'removeBundleItem',
      tags: ['Content'],
      summary: 'Remove content from a bundle',
      description: `Requires \`bundles:write\`. The content survives; access to it through the bundle ends. Returns the bundle's content.`,
      params: BundleItemParams,
      response: { 200: z.array(BundleItem), ...refusals(403, 404) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return content.removeBundleItem(req.params.bundleId, req.params.contentId, actor);
    },
  });
}
