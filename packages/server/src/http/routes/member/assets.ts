import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  Asset,
  AssetIdParam,
  AssetReference,
  DownloadTicket,
  ErrorBody,
  RequestMemberUpload,
  UploadTicket,
} from '../../schemas/index.js';
import { NotFoundError } from '@headless-lms/core/shared/errors';
import { UnauthorizedError } from '../../plugins/auth.js';
import type { Container } from '../../../app/container.js';

const tags = ['Assets'];

async function actorOf(container: Container, orgId: string, userId: string) {
  const orgUser = await container.organizations.getOrgUser(orgId, userId);
  if (!orgUser) {
    throw new UnauthorizedError();
  }
  return orgUser;
}

export async function memberAssetsRoutes(
  app: FastifyInstance,
  container: Container,
): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.route({
    method: 'POST',
    url: '/api/member/assets/:id/url',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'getAssetDownloadUrl',
      tags,
      summary: 'Get a short-lived URL for an asset, served as what the reference names',
      description:
        'The body names what the asset is being served as. The content that owns the reference decides whether the caller may see it. A 404 means the asset, the reference, or the access is missing.',
      params: AssetIdParam,
      body: AssetReference,
      response: { 200: DownloadTicket, 400: ErrorBody, 401: ErrorBody, 404: ErrorBody },
    },
    handler: async (req) => {
      const actor = await actorOf(container, req.orgId, req.userId);
      const ticket = await container.reporting.member.assetUrl(
        req.orgId,
        actor,
        req.params.id,
        req.body.via,
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
      tags,
      summary: 'Register an image you are about to upload and get a presigned upload URL',
      description:
        'Member uploads are images only. The asset is yours: only you can finalize it or attach it to your profile, a post or a message. You can delete it while nothing references it.',
      body: RequestMemberUpload,
      response: { 201: UploadTicket, 400: ErrorBody, 401: ErrorBody, 409: ErrorBody },
    },
    handler: async (req, reply) => {
      const actor = await actorOf(container, req.orgId, req.userId);
      const ticket = await container.assets.requestMemberUpload(req.orgId, actor.id, req.body);
      return reply.code(201).send(ticket);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/member/uploads/:id/finalize',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'finalizeMemberUpload',
      tags,
      summary: 'Confirm an upload you started',
      description:
        'Reads the stored size and content type. A file that is not an image or is over the size limit is discarded and answered with 409. A finalized file moves where the upload URL no longer reaches; finalizing it again returns it unchanged.',
      params: AssetIdParam,
      response: { 200: Asset, 401: ErrorBody, 404: ErrorBody, 409: ErrorBody },
    },
    handler: async (req) => {
      const actor = await actorOf(container, req.orgId, req.userId);
      const asset = await container.assets.confirmOwn(req.orgId, req.params.id, actor.id);
      if (!asset) {
        throw new NotFoundError('Asset', req.params.id);
      }
      return asset;
    },
  });

  r.route({
    method: 'DELETE',
    url: '/api/member/uploads/:id',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'deleteMemberUpload',
      tags,
      summary: 'Delete an upload of yours that nothing references',
      params: AssetIdParam,
      response: { 204: z.void(), 401: ErrorBody, 404: ErrorBody, 409: ErrorBody },
    },
    handler: async (req, reply) => {
      const actor = await actorOf(container, req.orgId, req.userId);
      const removed = await container.assets.removeOwn(req.orgId, req.params.id, actor.id);
      if (!removed) {
        throw new NotFoundError('Asset', req.params.id);
      }
      return reply.code(204).send();
    },
  });
}
