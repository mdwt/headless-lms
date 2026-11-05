// HTTP routes for the download content type. Request + response are validated
// against the shared contract schemas by the Zod type provider, and
// @fastify/swagger reads the same schemas to build the OpenAPI spec.
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  AddDownloadAsset,
  Download,
  DownloadFile,
  DownloadAssetParams,
  DownloadIdParam,
  DownloadsPage,
  DownloadsQuery,
  CreateDownload,
  RenameDownloadAsset,
  ReorderDownloadAssets,
  UpdateDownload,
  refusals,
} from '../schemas/index.js';
import { z } from 'zod';
import type { Container } from '../../app/container.js';
import { resolveActor } from '../scope.js';
import { describeOperation } from '../operations.js';

export async function downloadsRoutes(app: FastifyInstance, container: Container): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const content = container.content;

  r.route({
    method: 'GET',
    url: '/api/downloads',
    config: { operation: 'content.listDownloads' },
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'listDownloads',
      tags: ['Content'],
      summary: 'List downloads',
      description: `${describeOperation('content.listDownloads')} Every download, drafts included, filtered by status and category and searched by title.`,
      querystring: DownloadsQuery,
      response: { 200: DownloadsPage, ...refusals(403) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return content.listDownloads(req.query, actor);
    },
  });

  r.route({
    method: 'GET',
    url: '/api/downloads/:downloadId',
    config: { operation: 'content.getDownload' },
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'getDownload',
      tags: ['Content'],
      summary: 'Get a download',
      description: describeOperation('content.getDownload'),
      params: DownloadIdParam,
      response: { 200: Download, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return content.getDownload(req.params.downloadId, actor);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/downloads',
    config: { operation: 'content.createDownload' },
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'createDownload',
      tags: ['Content'],
      summary: 'Create a download',
      description: `${describeOperation('content.createDownload')} The download starts as a draft. 409 when its slug is taken.`,
      body: CreateDownload,
      response: { 201: Download, ...refusals(403, 409) },
    },
    handler: async (req, reply) => {
      const actor = await resolveActor(container, req);
      const download = await content.createDownload(req.body, actor);
      return reply.code(201).send(download);
    },
  });

  r.route({
    method: 'PATCH',
    url: '/api/downloads/:downloadId',
    config: { operation: 'content.updateDownload' },
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'updateDownload',
      tags: ['Content'],
      summary: 'Update a download',
      description: `${describeOperation('content.updateDownload')} Changes only the fields sent. \`thumbnailAssetId\` must be a ready library image (409 otherwise); null clears it. A file it does not already use must be uploaded for it, or the caller needs \`media:read\` (403 otherwise).`,
      params: DownloadIdParam,
      body: UpdateDownload,
      response: { 200: Download, ...refusals(403, 404, 409) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return content.updateDownload(req.params.downloadId, req.body, actor);
    },
  });

  r.route({
    method: 'DELETE',
    url: '/api/downloads/:downloadId',
    config: { operation: 'content.removeDownload' },
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'deleteDownload',
      tags: ['Content'],
      summary: 'Delete a download',
      description: `${describeOperation('content.removeDownload')} Its library files survive.`,
      params: DownloadIdParam,
      response: { 204: z.void(), ...refusals(403, 404) },
    },
    handler: async (req, reply) => {
      const actor = await resolveActor(container, req);
      await content.removeDownload(req.params.downloadId, actor);
      return reply.code(204).send();
    },
  });

  r.route({
    method: 'GET',
    url: '/api/downloads/:downloadId/assets',
    config: { operation: 'content.listDownloadAssets' },
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'listDownloadAssets',
      tags: ['Content'],
      summary: "List a download's files in order",
      description: describeOperation('content.listDownloadAssets'),
      params: DownloadIdParam,
      response: { 200: z.array(DownloadFile), ...refusals(403) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return content.listDownloadAssets(req.params.downloadId, actor);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/downloads/:downloadId/assets',
    config: { operation: 'content.addDownloadAsset' },
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'addDownloadAsset',
      tags: ['Content'],
      summary: 'Add a library file to a download',
      description: `${describeOperation('content.addDownloadAsset')} Added last. 409 when the file is not a ready library file or is already in the download. A file not uploaded for the download needs \`media:read\` (403 otherwise). Returns the download's files.`,
      params: DownloadIdParam,
      body: AddDownloadAsset,
      response: { 200: z.array(DownloadFile), ...refusals(403, 404, 409) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return content.addDownloadAsset(req.params.downloadId, req.body, actor);
    },
  });

  // Static segment before the parameterised sibling. Fastify's radix router
  // prefers static either way; the ordering documents the intent.
  r.route({
    method: 'PUT',
    url: '/api/downloads/:downloadId/assets/order',
    config: { operation: 'content.reorderDownloadAssets' },
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'reorderDownloadAssets',
      tags: ['Content'],
      summary: "Reorder a download's files",
      description: `${describeOperation('content.reorderDownloadAssets')} Send every file id of the download exactly once (409 otherwise). Returns the download's files.`,
      params: DownloadIdParam,
      body: ReorderDownloadAssets,
      response: { 200: z.array(DownloadFile), ...refusals(403, 404, 409) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return content.reorderDownloadAssets(req.params.downloadId, req.body.assetIds, actor);
    },
  });

  r.route({
    method: 'PATCH',
    url: '/api/downloads/:downloadId/assets/:assetId',
    config: { operation: 'content.renameDownloadAsset' },
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'renameDownloadAsset',
      tags: ['Content'],
      summary: "Set a file's display name within a download",
      description: `${describeOperation('content.renameDownloadAsset')} Null falls back to the filename. Returns the download's files.`,
      params: DownloadAssetParams,
      body: RenameDownloadAsset,
      response: { 200: z.array(DownloadFile), ...refusals(403, 404) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return content.renameDownloadAsset(
        req.params.downloadId,
        req.params.assetId,
        req.body.displayName,
        actor,
      );
    },
  });

  r.route({
    method: 'DELETE',
    url: '/api/downloads/:downloadId/assets/:assetId',
    config: { operation: 'content.removeDownloadAsset' },
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'removeDownloadAsset',
      tags: ['Content'],
      summary: 'Remove a file from a download',
      description: `${describeOperation('content.removeDownloadAsset')} The library file itself survives. Returns the download's files.`,
      params: DownloadAssetParams,
      response: { 200: z.array(DownloadFile), ...refusals(403, 404) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return content.removeDownloadAsset(req.params.downloadId, req.params.assetId, actor);
    },
  });
}
