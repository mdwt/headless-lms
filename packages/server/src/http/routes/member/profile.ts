import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { Container } from '../../../app/container.js';
import { resolveCaller } from '../../scope.js';
import { UpdateProfile, UserProfile, refusals } from '../../schemas/index.js';

export async function memberProfileRoutes(
  app: FastifyInstance,
  container: Container,
): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const tags = ['Profile'];

  async function memberOf(req: FastifyRequest) {
    const caller = await resolveCaller(container, req);
    return { ...caller.actor, userId: caller.userId };
  }

  r.route({
    method: 'GET',
    url: '/api/member/profile',
    config: { operation: 'identity.profileOf' },
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'getMemberProfile',
      tags,
      summary: 'Read your profile',
      description:
        'For any active member of the organization. The profile is yours across organizations; `imageUrl` is set only when the photo was uploaded in this organization. Before you save one, every field is empty.',
      response: { 200: UserProfile, ...refusals(403) },
    },
    handler: async (req) => {
      return container.identity.profileOf(await memberOf(req));
    },
  });

  r.route({
    method: 'PATCH',
    url: '/api/member/profile',
    config: { operation: 'identity.updateProfile' },
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
      return container.identity.updateProfile(req.body, await memberOf(req));
    },
  });
}
