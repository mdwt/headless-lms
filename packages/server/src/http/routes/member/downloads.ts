import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { DownloadIdParam, MemberDownload, MemberDownloads, refusals } from '../../schemas/index.js';
import type { Container } from '../../../app/container.js';
import { resolveActor } from '../../scope.js';

export async function memberDownloadsRoutes(
  app: FastifyInstance,
  container: Container,
): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const member = container.reporting.member;

  r.route({
    method: 'GET',
    url: '/api/member/downloads',
    config: { operation: 'reporting.member.listDownloads' },
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
      const actor = await resolveActor(container, req);
      return member.listDownloads(actor);
    },
  });

  r.route({
    method: 'GET',
    url: '/api/member/downloads/:downloadId',
    config: { operation: 'reporting.member.getDownload' },
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'getMemberDownload',
      tags: ['Content'],
      summary: 'One download you can open, with its files in order',
      description:
        'For a member of the organization who holds the download, or holds `downloads:read` on it (which also opens it unpublished). 404 otherwise.',
      params: DownloadIdParam,
      response: { 200: MemberDownload, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return member.getDownload(req.params.downloadId, actor);
    },
  });
}
