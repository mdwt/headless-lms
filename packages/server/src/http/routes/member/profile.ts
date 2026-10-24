import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { Container } from '../../../app/container.js';
import { UnauthorizedError } from '../../plugins/auth.js';
import { ErrorBody, UpdateProfile, UserProfile } from '../../schemas/index.js';

const errors = { 401: ErrorBody, 403: ErrorBody, 404: ErrorBody, 409: ErrorBody };

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
      response: { 200: UserProfile, ...errors },
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
      body: UpdateProfile,
      response: { 200: UserProfile, ...errors },
    },
    handler: async (req) => {
      const orgUser = await container.organizations.getOrgUser(req.orgId, req.userId);
      if (!orgUser) {
        throw new UnauthorizedError();
      }
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
