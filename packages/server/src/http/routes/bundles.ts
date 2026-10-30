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
import { NotFoundError } from '@headless-lms/core/shared/errors';
import { resolveScope } from '../scope.js';

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
      summary: 'List bundles (staff)',
      description: 'Staff only (owner, admin, instructor).',
      querystring: BundlesQuery,
      response: { 200: BundlesPage, ...refusals(403) },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return content.listBundles(scope.orgId, req.query);
    },
  });

  r.route({
    method: 'GET',
    url: '/api/bundles/:bundleId',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'getBundle',
      tags: ['Content'],
      summary: 'Get a bundle (staff)',
      description: 'Staff only (owner, admin, instructor).',
      params: BundleIdParam,
      response: { 200: Bundle, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      const bundle = await content.getBundle(scope.orgId, req.params.bundleId);
      if (!bundle) {
        throw new NotFoundError('Bundle', req.params.bundleId);
      }
      return bundle;
    },
  });

  r.route({
    method: 'POST',
    url: '/api/bundles',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'createBundle',
      tags: ['Content'],
      summary: 'Create a bundle, optionally with initial content (staff)',
      description:
        'Staff only (owner, admin, instructor). 404 when an initial content id is unknown.',
      body: CreateBundle,
      response: { 201: Bundle, ...refusals(403, 404) },
    },
    handler: async (req, reply) => {
      const scope = await resolveScope(container, req);
      const bundle = await content.createBundle(scope.orgId, req.body);
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
      summary: 'Rename a bundle (staff)',
      description: 'Staff only (owner, admin, instructor).',
      params: BundleIdParam,
      body: UpdateBundle,
      response: { 200: Bundle, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return content.updateBundle(scope.orgId, req.params.bundleId, req.body);
    },
  });

  r.route({
    method: 'DELETE',
    url: '/api/bundles/:bundleId',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'deleteBundle',
      tags: ['Content'],
      summary: 'Delete a bundle (staff)',
      description:
        'Staff only (owner, admin, instructor). Its content survives; access granted through the bundle ends.',
      params: BundleIdParam,
      response: { 204: z.void(), ...refusals(403, 404) },
    },
    handler: async (req, reply) => {
      const scope = await resolveScope(container, req);
      await content.deleteBundle(scope.orgId, req.params.bundleId);
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
      summary: "List a bundle's content (staff)",
      description: 'Staff only (owner, admin, instructor).',
      params: BundleIdParam,
      response: { 200: z.array(BundleItem), ...refusals(403) },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return content.listBundleItems(scope.orgId, req.params.bundleId);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/bundles/:bundleId/items',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'addBundleItem',
      tags: ['Content'],
      summary: 'Add content to a bundle (staff)',
      description:
        "Staff only (owner, admin, instructor). Everyone who holds the bundle can open the content from then on. Returns the bundle's content.",
      params: BundleIdParam,
      body: AddBundleItem,
      response: { 200: z.array(BundleItem), ...refusals(403, 404) },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return content.addBundleItem(scope.orgId, req.params.bundleId, req.body.contentId);
    },
  });

  r.route({
    method: 'DELETE',
    url: '/api/bundles/:bundleId/items/:contentId',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'removeBundleItem',
      tags: ['Content'],
      summary: 'Remove content from a bundle (staff)',
      description:
        "Staff only (owner, admin, instructor). The content survives; access to it through the bundle ends. Returns the bundle's content.",
      params: BundleItemParams,
      response: { 200: z.array(BundleItem), ...refusals(403, 404) },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return content.removeBundleItem(scope.orgId, req.params.bundleId, req.params.contentId);
    },
  });
}
