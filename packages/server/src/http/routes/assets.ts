// HTTP routes for the assets media library. All require a session with an
// active organization; assets are stored under the org's private prefix and
// served through stable staff URLs that redirect to a signed storage URL.
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
  RequestUpload,
  UploadTicket,
  refusals,
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
      summary: 'Register a library asset and get a presigned upload URL (staff)',
      description:
        'Staff only (owner, admin, instructor). The asset stays pending until you upload the file and confirm it.',
      body: RequestUpload,
      response: { 201: UploadTicket, ...refusals(403) },
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
      summary: 'Confirm a library upload completed (staff)',
      description:
        'Staff only (owner, admin, instructor). Captures the stored size and content type: a pending library upload becomes ready; a ready one is returned unchanged. A member upload is finalized only by its uploader and is answered with 403.',
      params: AssetIdParam,
      response: { 200: Asset, ...refusals(403, 404) },
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
      summary: "Browse the organization's media library (staff)",
      description:
        "Staff only (owner, admin, instructor). Library files by default; `source: member` lists members' uploads.",
      querystring: AssetsQuery,
      response: { 200: AssetsPage, ...refusals(403) },
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
      summary: "Get an asset's metadata (staff)",
      description: 'Staff only (owner, admin, instructor).',
      params: AssetIdParam,
      response: { 200: Asset, ...refusals(403, 404) },
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
      summary: 'Delete an asset nothing references (staff)',
      description:
        'Staff only (owner, admin, instructor). Removes the row and the stored file. 409 while content still uses it.',
      params: AssetIdParam,
      response: { 204: z.void(), ...refusals(403, 404, 409) },
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

  for (const { suffix, download, operationId, summary } of [
    {
      suffix: 'file',
      download: false,
      operationId: 'getLibraryFile',
      summary: 'Redirect to a library file to show it (staff)',
    },
    {
      suffix: 'download',
      download: true,
      operationId: 'downloadLibraryFile',
      summary: 'Redirect to a library file saved under its filename (staff)',
    },
  ]) {
    r.route({
      method: 'GET',
      url: `/api/assets/:id/${suffix}`,
      preHandler: staff,
      schema: {
        operationId,
        tags,
        summary,
        description:
          'Staff only (owner, admin, instructor). Ready library files of the organization; member uploads and pending files answer 404.',
        params: AssetIdParam,
        response: { 302: z.void(), ...refusals(403, 404) },
      },
      handler: async (req, reply) => {
        const orgId = await resolveOrgId(req, reply);
        if (!orgId) {
          return;
        }
        const url = await assets.libraryFile(orgId, req.params.id, { download });
        if (!url) {
          throw new NotFoundError('Asset', req.params.id);
        }
        return reply
          .header('cache-control', 'no-store')
          .header('referrer-policy', 'no-referrer')
          .redirect(url, 302);
      },
    });
  }
}
