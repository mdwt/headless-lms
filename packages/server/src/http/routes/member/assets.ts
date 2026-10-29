import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  Asset,
  AssetIdParam,
  RequestMemberUpload,
  UploadTicket,
  refusals,
} from '../../schemas/index.js';
import { NotFoundError } from '@headless-lms/core/shared/errors';
import { actorOf } from './actor.js';
import type { Container } from '../../../app/container.js';

const tags = ['Assets'];

export async function memberAssetsRoutes(
  app: FastifyInstance,
  container: Container,
): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.route({
    method: 'POST',
    url: '/api/member/uploads',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'requestMemberUpload',
      tags,
      summary: 'Register an image you are about to upload and get a presigned upload URL',
      description:
        'For a member of the organization. Member uploads are images only (409 otherwise). The asset is yours: only you can finalize it or attach it to your profile, a post or a message. You can delete it while nothing references it.',
      body: RequestMemberUpload,
      response: { 201: UploadTicket, ...refusals(403, 409) },
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
        'Uploader only; anyone else gets 404. Reads the stored size and content type. A file that is not an image or is over the size limit is discarded and answered with 409. A finalized file moves where the upload URL no longer reaches; finalizing it again returns it unchanged.',
      params: AssetIdParam,
      response: { 200: Asset, ...refusals(403, 404, 409) },
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
      description:
        'Uploader only; anyone else gets 404. 409 while a profile, post or message still uses it.',
      params: AssetIdParam,
      response: { 204: z.void(), ...refusals(403, 404, 409) },
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
