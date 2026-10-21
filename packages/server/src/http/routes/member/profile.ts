import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { Container } from '../../../app/container.js';
import { NotFoundError } from '@headless-lms/core/shared/errors';
import { ErrorBody, UpdateProfile, UserProfile } from '../../schemas/index.js';

const errors = { 401: ErrorBody, 403: ErrorBody, 404: ErrorBody, 409: ErrorBody };

export async function memberProfileRoutes(app: FastifyInstance, container: Container): Promise<void> {
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
      const profile = await container.identity.getProfile(req.userId);
      if (!profile) {
        throw new NotFoundError('Profile', req.userId);
      }
      return profile;
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
      return container.identity.updateProfile(req.userId, req.userId, req.body);
    },
  });
}
