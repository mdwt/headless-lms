import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import type { Container } from '../../../app/container.js';
import { memberFileRoutes } from './files.js';

let app: FastifyInstance;

beforeAll(async () => {
  app = Fastify();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.decorate('requireOrgSession', async () => {});
  await memberFileRoutes(app, { reporting: { member: {} } } as unknown as Container);
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe('member file routes', () => {
  it('has no route for a profile photo, which is a public image', () => {
    expect(app.hasRoute({ method: 'GET', url: '/api/member/people/:orgUserId/image' })).toBe(false);
  });

  it('keeps the access-checked routes for unpublished thumbnails and covers', () => {
    for (const url of [
      '/api/member/courses/:courseId/thumbnail',
      '/api/member/downloads/:downloadId/thumbnail',
      '/api/member/communities/:communityId/thumbnail',
      '/api/member/events/:eventId/thumbnail',
      '/api/member/posts/:postId/cover',
    ]) {
      expect(app.hasRoute({ method: 'GET', url }), url).toBe(true);
    }
  });
});
