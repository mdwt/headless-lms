// HTTP routes for the assets media library. All require a session with an
// active organization; assets are stored under the org's private prefix and
// served only through the short-lived signed URLs responses carry.
//
// `req.orgId` is already the domain organization id these tables key on — the
// session guard translates it from better-auth's id once per request.
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  Asset,
  AssetIdParam,
  AssetsPage,
  AssetsQuery,
  ErrorBody,
  RequestUpload,
  UploadTicket,
} from '../schemas/index.js';
import { NotFoundError } from '@headless-lms/core/shared/errors';
import type { Container } from '../../app/container.js';
import { resolveScope } from '../scope.js';

/** Resolve the session's active org to the domain org id, or 400 and return null. */
async function resolveOrgId(req: FastifyRequest, reply: FastifyReply): Promise<string | null> {
  if (!req.orgId) {
    await reply.code(400).send({ error: 'no_active_org', message: 'No active organization' });
    return null;
  }
  return req.orgId;
}

export async function assetsRoutes(app: FastifyInstance, container: Container): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const assets = container.assets;
  const tags = ['Assets'];
  const staff = async (req: FastifyRequest) => {
    await resolveScope(container, req);
  };

  // Register an asset + get a presigned upload URL. Kept at /api/uploads as the
  // "start an upload" action; the resulting asset lives in the library below.
  r.route({
    method: 'POST',
    url: '/api/uploads',
    preHandler: staff,
    schema: {
      operationId: 'requestUpload',
      tags,
      summary: 'Register an asset and get a presigned upload URL',
      body: RequestUpload,
      response: { 201: UploadTicket, 400: ErrorBody, 401: ErrorBody },
    },
    handler: async (req, reply) => {
      const scope = await resolveScope(container, req);
      const ticket = await assets.requestUpload(scope.orgId, {
        ...req.body,
        source: 'library',
        uploadedBy: scope.orgUserId,
      });
      return reply.code(201).send(ticket);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/assets/:id/confirm',
    preHandler: staff,
    schema: {
      operationId: 'confirmAsset',
      tags,
      summary: 'Confirm an upload completed (captures size + content type)',
      description:
        'A pending library upload becomes ready; a ready one is returned unchanged. A member upload is finalized only by its uploader and is answered with 403.',
      params: AssetIdParam,
      response: { 200: Asset, 400: ErrorBody, 401: ErrorBody, 403: ErrorBody, 404: ErrorBody },
    },
    handler: async (req, reply) => {
      const orgId = await resolveOrgId(req, reply);
      if (!orgId) {
        return;
      }
      const asset = await assets.confirm(orgId, req.params.id);
      if (!asset) {
        throw new NotFoundError('Asset', req.params.id);
      }
      return asset;
    },
  });

  r.route({
    method: 'GET',
    url: '/api/assets',
    preHandler: staff,
    schema: {
      operationId: 'listAssets',
      tags,
      summary: "Browse the organization's media library",
      querystring: AssetsQuery,
      response: { 200: AssetsPage, 400: ErrorBody, 401: ErrorBody },
    },
    handler: async (req, reply) => {
      const orgId = await resolveOrgId(req, reply);
      if (!orgId) {
        return;
      }
      return assets.list(orgId, req.query);
    },
  });

  r.route({
    method: 'GET',
    url: '/api/assets/:id',
    preHandler: staff,
    schema: {
      operationId: 'getAsset',
      tags,
      summary: "Get an asset's metadata",
      params: AssetIdParam,
      response: { 200: Asset, 400: ErrorBody, 401: ErrorBody, 404: ErrorBody },
    },
    handler: async (req, reply) => {
      const orgId = await resolveOrgId(req, reply);
      if (!orgId) {
        return;
      }
      const asset = await assets.get(orgId, req.params.id);
      if (!asset) {
        throw new NotFoundError('Asset', req.params.id);
      }
      return asset;
    },
  });

  r.route({
    method: 'DELETE',
    url: '/api/assets/:id',
    preHandler: staff,
    schema: {
      operationId: 'deleteAsset',
      tags,
      summary: 'Delete an asset nothing references (removes the object from storage)',
      params: AssetIdParam,
      response: {
        204: z.void(),
        400: ErrorBody,
        401: ErrorBody,
        404: ErrorBody,
        409: ErrorBody,
      },
    },
    handler: async (req, reply) => {
      const orgId = await resolveOrgId(req, reply);
      if (!orgId) {
        return;
      }
      const removed = await assets.remove(orgId, req.params.id);
      if (!removed) {
        throw new NotFoundError('Asset', req.params.id);
      }
      return reply.code(204).send();
    },
  });
}
