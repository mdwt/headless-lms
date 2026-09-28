// HTTP routes for the download content type. Request + response are validated
// against the shared contract schemas by the Zod type provider, and
// @fastify/swagger reads the same schemas to build the OpenAPI spec.
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  AddDownloadAsset,
  Download,
  DownloadAsset,
  DownloadAssetParams,
  DownloadIdParam,
  DownloadsPage,
  DownloadsQuery,
  CreateDownload,
  ErrorBody,
  RenameDownloadAsset,
  ReorderDownloadAssets,
  UpdateDownload,
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
      summary: 'List downloads',
      querystring: DownloadsQuery,
      response: { 200: DownloadsPage },
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
      summary: 'Get a download by id',
      params: DownloadIdParam,
      response: { 200: Download, 404: ErrorBody },
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
      summary: 'Create a download',
      body: CreateDownload,
      response: { 201: Download },
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
      summary: 'Update a download',
      params: DownloadIdParam,
      body: UpdateDownload,
      response: { 200: Download, 404: ErrorBody },
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
      summary: 'Delete a download',
      params: DownloadIdParam,
      response: { 204: z.void(), 404: ErrorBody },
    },
    handler: async (req, reply) => {
      const scope = await resolveScope(container, req);
      await content.removeDownload(scope.orgId, req.params.downloadId);
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
      summary: "List a download's assets in order",
      params: DownloadIdParam,
      response: { 200: z.array(DownloadAsset), 404: ErrorBody },
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
      summary: 'Link a media-library asset to a download',
      params: DownloadIdParam,
      body: AddDownloadAsset,
      response: { 200: z.array(DownloadAsset), 404: ErrorBody },
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
      summary: "Reorder a download's assets (send the complete set)",
      params: DownloadIdParam,
      body: ReorderDownloadAssets,
      response: { 200: z.array(DownloadAsset), 404: ErrorBody, 409: ErrorBody },
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
      summary: "Set an asset's display name within a download",
      params: DownloadAssetParams,
      body: RenameDownloadAsset,
      response: { 200: z.array(DownloadAsset), 404: ErrorBody },
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
      summary: 'Unlink an asset from a download (the asset itself survives)',
      params: DownloadAssetParams,
      response: { 200: z.array(DownloadAsset), 404: ErrorBody },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return content.removeDownloadAsset(scope.orgId, req.params.downloadId, req.params.assetId);
    },
  });
}
