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
import { NotFoundError } from '@headless-lms/core/shared/errors';
import { resolveScope } from '../scope.js';

export async function downloadsRoutes(app: FastifyInstance, container: Container): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const content = container.content;

  r.route({
    method: 'GET',
    url: '/api/downloads',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'listDownloads',
      tags: ['Content'],
      summary: 'List downloads (staff)',
      description:
        'Staff only (owner, admin, instructor). Every download, drafts included, filtered by status and category and searched by title.',
      querystring: DownloadsQuery,
      response: { 200: DownloadsPage, ...refusals(403) },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return content.listDownloads(scope.orgId, req.query);
    },
  });

  r.route({
    method: 'GET',
    url: '/api/downloads/:downloadId',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'getDownload',
      tags: ['Content'],
      summary: 'Get a download (staff)',
      description: 'Staff only (owner, admin, instructor).',
      params: DownloadIdParam,
      response: { 200: Download, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      const download = await content.getDownload(scope.orgId, req.params.downloadId);
      if (!download) {
        throw new NotFoundError('Download', req.params.downloadId);
      }
      return download;
    },
  });

  r.route({
    method: 'POST',
    url: '/api/downloads',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'createDownload',
      tags: ['Content'],
      summary: 'Create a download (staff)',
      description:
        'Staff only (owner, admin, instructor). The download starts as a draft. 409 when its slug is taken.',
      body: CreateDownload,
      response: { 201: Download, ...refusals(403, 409) },
    },
    handler: async (req, reply) => {
      const scope = await resolveScope(container, req);
      const download = await content.createDownload(scope.orgId, req.body);
      return reply.code(201).send(download);
    },
  });

  r.route({
    method: 'PATCH',
    url: '/api/downloads/:downloadId',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'updateDownload',
      tags: ['Content'],
      summary: 'Update a download (staff)',
      description:
        'Staff only (owner, admin, instructor). Changes only the fields sent. `thumbnailAssetId` must be a ready library image (409 otherwise); null clears it.',
      params: DownloadIdParam,
      body: UpdateDownload,
      response: { 200: Download, ...refusals(403, 404, 409) },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return content.updateDownload(scope.orgId, req.params.downloadId, req.body);
    },
  });

  r.route({
    method: 'DELETE',
    url: '/api/downloads/:downloadId',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'deleteDownload',
      tags: ['Content'],
      summary: 'Delete a download (staff)',
      description: 'Staff only (owner, admin, instructor). Its library files survive.',
      params: DownloadIdParam,
      response: { 204: z.void(), ...refusals(403, 404) },
    },
    handler: async (req, reply) => {
      const scope = await resolveScope(container, req);
      await content.removeDownload(scope.orgId, req.params.downloadId, {
        id: scope.orgUserId,
        role: scope.role,
      });
      return reply.code(204).send();
    },
  });

  r.route({
    method: 'GET',
    url: '/api/downloads/:downloadId/assets',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'listDownloadAssets',
      tags: ['Content'],
      summary: "List a download's files in order (staff)",
      description: 'Staff only (owner, admin, instructor).',
      params: DownloadIdParam,
      response: { 200: z.array(DownloadFile), ...refusals(403) },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return content.listDownloadAssets(scope.orgId, req.params.downloadId);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/downloads/:downloadId/assets',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'addDownloadAsset',
      tags: ['Content'],
      summary: 'Add a library file to a download (staff)',
      description:
        "Staff only (owner, admin, instructor). Added last. 409 when the file is not a ready library file or is already in the download. Returns the download's files.",
      params: DownloadIdParam,
      body: AddDownloadAsset,
      response: { 200: z.array(DownloadFile), ...refusals(403, 404, 409) },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return content.addDownloadAsset(scope.orgId, req.params.downloadId, req.body);
    },
  });

  // Static segment before the parameterised sibling. Fastify's radix router
  // prefers static either way; the ordering documents the intent.
  r.route({
    method: 'PUT',
    url: '/api/downloads/:downloadId/assets/order',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'reorderDownloadAssets',
      tags: ['Content'],
      summary: "Reorder a download's files (staff)",
      description:
        "Staff only (owner, admin, instructor). Send every file id of the download exactly once (409 otherwise). Returns the download's files.",
      params: DownloadIdParam,
      body: ReorderDownloadAssets,
      response: { 200: z.array(DownloadFile), ...refusals(403, 404, 409) },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return content.reorderDownloadAssets(scope.orgId, req.params.downloadId, req.body.assetIds);
    },
  });

  r.route({
    method: 'PATCH',
    url: '/api/downloads/:downloadId/assets/:assetId',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'renameDownloadAsset',
      tags: ['Content'],
      summary: "Set a file's display name within a download (staff)",
      description:
        "Staff only (owner, admin, instructor). Null falls back to the filename. Returns the download's files.",
      params: DownloadAssetParams,
      body: RenameDownloadAsset,
      response: { 200: z.array(DownloadFile), ...refusals(403, 404) },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return content.renameDownloadAsset(
        scope.orgId,
        req.params.downloadId,
        req.params.assetId,
        req.body.displayName,
      );
    },
  });

  r.route({
    method: 'DELETE',
    url: '/api/downloads/:downloadId/assets/:assetId',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'removeDownloadAsset',
      tags: ['Content'],
      summary: 'Remove a file from a download (staff)',
      description:
        "Staff only (owner, admin, instructor). The library file itself survives. Returns the download's files.",
      params: DownloadAssetParams,
      response: { 200: z.array(DownloadFile), ...refusals(403, 404) },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return content.removeDownloadAsset(scope.orgId, req.params.downloadId, req.params.assetId);
    },
  });
}
