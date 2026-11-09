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
import { resolveActor } from '../../scope.js';
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
      summary: 'Register a file you are about to upload and get a presigned upload URL',
      description:
        'For a member of the organization. Any file type. A raster image (PNG, JPEG, GIF, WebP, AVIF) can be your profile photo, a post cover or a message attachment; any upload can be shown in the body of your post. The asset is yours: only you can finalize it or attach it. You can delete it while nothing references it.',
      body: RequestMemberUpload,
      response: { 201: UploadTicket, ...refusals(403, 409) },
    },
    handler: async (req, reply) => {
      const actor = await resolveActor(container, req);
      const ticket = await container.assets.requestMemberUpload(req.body, actor);
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
        'Uploader only; anyone else gets 404. Reads the stored size and content type. A file whose stored type differs from the declared one, or that is over its size limit (`MEMBER_IMAGE_MAX_BYTES` for images, `MEMBER_FILE_MAX_BYTES` for any other file), is discarded and answered with 409. A finalized file moves where the upload URL no longer reaches; finalizing it again returns it unchanged.',
      params: AssetIdParam,
      response: { 200: Asset, ...refusals(403, 404, 409) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return container.assets.confirmOwn(req.params.id, actor);
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
      const actor = await resolveActor(container, req);
      await container.assets.removeOwn(req.params.id, actor);
      return reply.code(204).send();
    },
  });
}
