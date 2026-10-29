import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { Container } from '../../../app/container.js';
import { actorOf } from './actor.js';
import { UpdateProfile, UserProfile, refusals } from '../../schemas/index.js';

export async function memberProfileRoutes(
  app: FastifyInstance,
  container: Container,
): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const tags = ['Profile'];

  r.route({
    method: 'GET',
    url: '/api/member/profile',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'getMemberProfile',
      tags,
      summary: 'Read your profile',
      description:
        'For any signed-in person. The profile is yours across organizations; `imageUrl` is set only when the photo was uploaded in this organization. Before you save one, every field is empty.',
      response: { 200: UserProfile },
    },
    handler: async (req) => {
      return container.identity.profileOf(req.orgId, req.userId);
    },
  });

  r.route({
    method: 'PATCH',
    url: '/api/member/profile',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'updateMemberProfile',
      tags,
      summary: 'Update your profile',
      description:
        'For a member of the organization. Changes only the fields sent; null clears one. 404 when `imageAssetId` is not a finalized image you uploaded here.',
      body: UpdateProfile,
      response: { 200: UserProfile, ...refusals(403, 404) },
    },
    handler: async (req) => {
      const orgUser = await actorOf(container, req.orgId, req.userId);
      return container.identity.updateProfile(
        req.orgId,
        req.userId,
        req.userId,
        orgUser.id,
        req.body,
      );
    },
  });
}
