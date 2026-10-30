import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { DownloadIdParam, MemberDownload, MemberDownloads, refusals } from '../../schemas/index.js';
import { NotFoundError } from '@headless-lms/core/shared/errors';
import type { Container } from '../../../app/container.js';
import { actorOf } from './actor.js';

export async function memberDownloadsRoutes(
  app: FastifyInstance,
  container: Container,
): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const member = container.reporting.member;

  r.route({
    method: 'GET',
    url: '/api/member/downloads',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'listMemberDownloads',
      tags: ['Content'],
      summary: 'List the downloads you can open',
      description:
        'For a member of the organization. Published downloads you hold, directly or through a bundle.',
      response: { 200: MemberDownloads, ...refusals(403) },
    },
    handler: async (req) => {
      const orgUser = await actorOf(container, req.orgId, req.userId);
      return member.listDownloads(req.orgId, orgUser.id);
    },
  });

  r.route({
    method: 'GET',
    url: '/api/member/downloads/:downloadId',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'getMemberDownload',
      tags: ['Content'],
      summary: 'One download you can open, with its files in order',
      description:
        'For a member of the organization. 404 when the download is not published or you do not hold it.',
      params: DownloadIdParam,
      response: { 200: MemberDownload, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const orgUser = await actorOf(container, req.orgId, req.userId);
      const result = await member.getDownload(req.orgId, orgUser.id, req.params.downloadId);
      if (!result) {
        throw new NotFoundError('Download', req.params.downloadId);
      }
      return result;
    },
  });
}
