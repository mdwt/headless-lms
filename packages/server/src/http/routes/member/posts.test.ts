import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import type { Container } from '../../../app/container.js';
import { registerAuth } from '../../plugins/auth.js';
import { errorHandler } from '../../plugins/error-handler.js';
import { memberCommentsRoutes } from './comments.js';
import { memberPostRoutes } from './posts.js';

const ORG = { id: 'org_1', name: 'Acme', slug: 'acme', externalId: 'org_1' };
const ORG_USER = { id: 'ou_mod', role: 'moderator' };
const calls: { method: string; args: unknown[] }[] = [];

function record(method: string, result: unknown) {
  return async (...args: unknown[]) => {
    calls.push({ method, args });
    return result;
  };
}

const container = {
  auth: {
    verify: async () => ({
      user: { id: 'usr_1', email: 'a@b.c' },
      session: { activeOrganizationId: ORG.id },
    }),
  },
  organizations: {
    getByExternalId: async () => ORG,
    getOrgUser: async () => ORG_USER,
  },
  discussion: { resolveReports: record('resolveReports', undefined) },
  posts: {
    spaceFeed: record('spaceFeed', { rows: [], total: 0, page: 1, pageSize: 5 }),
    moderationQueue: record('moderationQueue', { pending: [], flags: [], commentFlags: [] }),
    listOwn: record('listOwn', { rows: [], total: 0, page: 2, pageSize: 5 }),
    listBookmarked: record('listBookmarked', { rows: [], total: 0, page: 1, pageSize: 20 }),
  },
} as unknown as Container;

let app: FastifyInstance;

beforeAll(async () => {
  app = Fastify();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.setErrorHandler(errorHandler);
  registerAuth(app, container);
  await memberCommentsRoutes(app, container);
  await memberPostRoutes(app, container);
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

function last(method: string) {
  return calls.filter((call) => call.method === method).at(-1)?.args;
}

describe('member post and comment routes', () => {
  it('lets a member route dismiss the flags on a comment', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/api/member/comments/cmt_1/reports' });
    expect(res.statusCode).toBe(204);
    expect(last('resolveReports')).toEqual([ORG.id, 'cmt_1', ORG_USER]);
  });

  it('passes the community of the path to the space feed and the queue', async () => {
    const feed = await app.inject({
      method: 'GET',
      url: '/api/member/communities/cmy_1/spaces/spc_1/feed?page=2&pageSize=5&topicId=tpc_1',
    });
    expect(feed.statusCode).toBe(200);
    expect(feed.json()).toEqual({ rows: [], total: 0, page: 1, pageSize: 5 });
    expect(last('spaceFeed')).toEqual([
      ORG.id,
      ORG_USER,
      'cmy_1',
      'spc_1',
      { page: 2, pageSize: 5, topicId: 'tpc_1' },
    ]);
    const queue = await app.inject({
      method: 'GET',
      url: '/api/member/communities/cmy_1/spaces/spc_1/queue',
    });
    expect(queue.statusCode).toBe(200);
    expect(last('moderationQueue')).toEqual([ORG.id, ORG_USER, 'cmy_1', 'spc_1']);
  });

  it('pages your own posts and your bookmarks for a community', async () => {
    const own = await app.inject({
      method: 'GET',
      url: '/api/member/communities/cmy_1/own-posts?page=2&pageSize=5',
    });
    const saved = await app.inject({
      method: 'GET',
      url: '/api/member/communities/cmy_1/bookmarks',
    });
    expect([own.statusCode, saved.statusCode]).toEqual([200, 200]);
    expect(own.json()).toEqual({ rows: [], total: 0, page: 2, pageSize: 5 });
    expect(saved.json()).toEqual({ rows: [], total: 0, page: 1, pageSize: 20 });
    expect(last('listOwn')).toEqual([ORG.id, ORG_USER, 'cmy_1', { page: 2, pageSize: 5 }]);
    expect(last('listBookmarked')).toEqual([ORG.id, ORG_USER, 'cmy_1', { page: 1, pageSize: 20 }]);
  });

  it('accepts only a dismissal when resolving post flags', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/member/posts/pst_1/flags/resolution',
      payload: { resolution: 'removed' },
    });
    expect(res.statusCode).toBe(400);
  });
});
