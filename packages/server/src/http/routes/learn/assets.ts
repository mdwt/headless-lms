import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ErrorBody, LearnActivityAssetParams } from '../../schemas/index.js';
import { NotFoundError } from '@headless-lms/core/shared/errors';
import type { Container } from '../../../app/container.js';
import { UnauthorizedError } from '../../plugins/auth.js';

export async function learnAssetsRoutes(app: FastifyInstance, container: Container): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const learn = container.reporting.learn;

  r.route({
    method: 'GET',
    url: '/api/learn/activities/:activityId/assets/:assetId',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'getLearnActivityAsset',
      tags: ['Content'],
      summary: 'Redirect to a signed URL for an asset in a lesson',
      params: LearnActivityAssetParams,
      response: { 302: z.void(), 404: ErrorBody },
    },
    handler: async (req, reply) => {
      const orgUser = await container.organizations.getOrgUser(req.orgId, req.userId);
      if (!orgUser) {
        throw new UnauthorizedError();
      }
      const signed = await learn.activityAssetUrl(
        req.orgId,
        orgUser.id,
        req.params.activityId,
        req.params.assetId,
      );
      if (!signed) {
        throw new NotFoundError('Activity asset', req.params.assetId);
      }
      return reply
        .header('cache-control', 'no-store')
        .header('referrer-policy', 'no-referrer')
        .redirect(signed.url, 302);
    },
  });
}
