import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  Asset,
  AssetIdParam,
  DownloadTicket,
  ErrorBody,
  RequestImageUpload,
  UploadTicket,
} from '../../schemas/index.js';
import { NotFoundError } from '@headless-lms/core/shared/errors';
import { UnauthorizedError } from '../../plugins/auth.js';
import type { Container } from '@headless-lms/server';

export async function memberAssetsRoutes(
  app: FastifyInstance,
  container: Container,
): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  // Content embeds assets by stable `assetId`; the URL persisted at authoring
  // time is a long-expired presign. The student surface mints a fresh
  // short-lived ticket here, scoped to the session's portal org.
  r.route({
    method: 'POST',
    url: '/api/member/assets/:id/url',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'getAssetDownloadUrl',
      tags: ['Assets'],
      summary: 'Get a short-lived presigned URL to serve an asset to the student',
      params: AssetIdParam,
      response: { 200: DownloadTicket, 401: ErrorBody, 404: ErrorBody },
    },
    handler: async (req) => {
      const orgUser = await container.organizations.getOrgUser(req.orgId, req.userId);
      if (!orgUser) {
        throw new UnauthorizedError();
      }
      const ticket = await container.reporting.member.assetUrl(
        req.orgId,
        orgUser.id,
        req.params.id,
      );
      if (!ticket) {
        throw new NotFoundError('Asset', req.params.id);
      }
      return ticket;
    },
  });

  r.route({
    method: 'POST',
    url: '/api/member/uploads',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'requestMemberUpload',
      tags: ['Assets'],
      summary: 'Register an image and get a presigned upload URL',
      body: RequestImageUpload,
      response: { 201: UploadTicket, 400: ErrorBody, 401: ErrorBody },
    },
    handler: async (req, reply) => {
      const orgUser = await container.organizations.getOrgUser(req.orgId, req.userId);
      if (!orgUser) {
        throw new UnauthorizedError();
      }
      const ticket = await container.assets.requestImageUpload(req.orgId, orgUser.id, req.body);
      return reply.code(201).send(ticket);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/member/uploads/:id/finalize',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'finalizeMemberUpload',
      tags: ['Assets'],
      summary: 'Confirm an image upload you started',
      params: AssetIdParam,
      response: { 200: Asset, 401: ErrorBody, 404: ErrorBody },
    },
    handler: async (req) => {
      const orgUser = await container.organizations.getOrgUser(req.orgId, req.userId);
      if (!orgUser) {
        throw new UnauthorizedError();
      }
      const asset = await container.assets.confirmOwnImage(req.orgId, req.params.id, orgUser.id);
      if (!asset) {
        throw new NotFoundError('Asset', req.params.id);
      }
      return asset;
    },
  });
}
