import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import type { Container } from '../../../app/container.js';
import { registerAuth } from '../../plugins/auth.js';
import { errorHandler } from '../../plugins/error-handler.js';
import { memberCommentsRoutes } from './comments.js';
import { memberPostRoutes } from './posts.js';
import { memberChatRoutes } from './chats.js';
import { mcpEndpoints } from '../../../app/mcp-endpoints.js';
import { ConflictError, UnavailableError } from '@headless-lms/core/shared/errors';
import { actorWith } from '@headless-lms/core/organizations';
import { resolvedCaller } from '../../test-caller.js';

const ORG = { id: 'org_1', name: 'Acme', slug: 'acme', externalId: 'org_1' };
const ORG_USER = { id: 'ou_mod', orgId: ORG.id, userId: 'usr_1' };
const ACTOR = actorWith({ id: ORG_USER.id, orgId: ORG.id });
let orgUser: typeof ORG_USER | null = ORG_USER;
const calls: { method: string; args: unknown[] }[] = [];

const AT = '2026-10-29T12:00:00.000Z';
const COMMENT = {
  id: 'cmt_1',
  orgId: ORG.id,
  activityId: 'act_1',
  postId: null,
  communityId: null,
  parentId: null,
  orgUserId: 'ou_sarah',
  body: 'Hi',
  status: 'published',
  removedBy: null,
  createdAt: AT,
  updatedAt: AT,
};
const COMMENT_VIEW = {
  id: 'cmt_1',
  activityId: 'act_1',
  postId: null,
  communityId: null,
  parentId: null,
  author: {
    id: 'ou_sarah',
    firstName: 'Sarah',
    lastName: null,
    displayName: null,
    headline: null,
    image: null,
    imageAssetId: null,
    imageUrl: null,
    team: false,
    roleName: null,
  },
  body: 'Hi',
  status: 'published',
  removedBy: null,
  reactions: {},
  mentions: [],
  createdAt: AT,
  updatedAt: AT,
};

function record(method: string, result: unknown) {
  return async (...args: unknown[]) => {
    calls.push({ method, args });
    return result;
  };
}

const container = {
  mcp: mcpEndpoints({
    authBaseURL: 'https://lms.example.com',
    adminAppUrl: 'https://admin.example.com',
  }),
  requestContext: { set: () => {} },
  auth: {
    verify: async () => ({
      user: { id: 'usr_1', email: 'a@b.c' },
      session: { activeOrganizationId: ORG.id },
    }),
  },
  organizations: {
    getByExternalId: async () => ORG,
    getOrgUser: async () => orgUser,
    actorFor: async () => ACTOR,
    resolveCaller: async () => resolvedCaller(ORG, { id: 'usr_1' }, orgUser, ACTOR),
  },
  identity: { getUserByExternalId: async () => ({ id: 'usr_1' }) },
  discussion: {
    resolveReports: record('resolveReports', undefined),
    restore: record('restoreComment', COMMENT_VIEW),
    approve: record('approveComment', COMMENT),
  },
  chats: { messageQueue: record('messageQueue', { entries: [] }) },
  posts: {
    spaceFeed: record('spaceFeed', { rows: [], total: 0, page: 1, pageSize: 5 }),
    moderationQueue: record('moderationQueue', { pending: [], flags: [], commentFlags: [] }),
    listOwn: record('listOwn', { rows: [], total: 0, page: 2, pageSize: 5 }),
    listBookmarked: record('listBookmarked', { rows: [], total: 0, page: 1, pageSize: 20 }),
    setReaction: record('setPostReaction', { reactions: {} }),
    unschedule: async (...args: unknown[]) => {
      calls.push({ method: 'unschedule', args });
      throw new ConflictError('This post is not scheduled');
    },
    schedule: async (...args: unknown[]) => {
      calls.push({ method: 'schedule', args });
      throw new UnavailableError('The post could not be scheduled; try again', {
        postId: 'pst_1',
      });
    },
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
  await memberChatRoutes(app, container);
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
    const res = await app.inject({
      method: 'POST',
      url: '/api/member/comments/cmt_1/flags/resolve',
      payload: { resolution: 'dismissed' },
    });
    expect(res.statusCode).toBe(204);
    expect(last('resolveReports')).toEqual(['cmt_1', 'any', ACTOR]);
  });

  it('reads the message queue of a community from the member app', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/member/communities/cmy_1/message-queue',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ entries: [] });
    expect(last('messageQueue')).toEqual(['cmy_1', ACTOR]);
  });

  it('restores and approves a comment from the member app', async () => {
    const restored = await app.inject({
      method: 'POST',
      url: '/api/member/comments/cmt_1/restore',
    });
    const approved = await app.inject({
      method: 'POST',
      url: '/api/member/comments/cmt_1/approve',
    });
    expect([restored.statusCode, approved.statusCode]).toEqual([200, 200]);
    expect(restored.json()).toMatchObject({ id: 'cmt_1', author: { team: false, roleName: null } });
    expect(last('restoreComment')).toEqual(['cmt_1', 'any', ACTOR]);
    expect(last('approveComment')).toEqual(['cmt_1', ACTOR]);
  });

  it('passes the community of the path to the space feed and the queue', async () => {
    const feed = await app.inject({
      method: 'GET',
      url: '/api/member/communities/cmy_1/spaces/spc_1/feed?page=2&pageSize=5&topicId=tpc_1',
    });
    expect(feed.statusCode).toBe(200);
    expect(feed.json()).toEqual({ rows: [], total: 0, page: 1, pageSize: 5 });
    expect(last('spaceFeed')).toEqual([
      'cmy_1',
      'spc_1',
      { page: 2, pageSize: 5, topicId: 'tpc_1' },
      ACTOR,
    ]);
    const queue = await app.inject({
      method: 'GET',
      url: '/api/member/communities/cmy_1/spaces/spc_1/queue',
    });
    expect(queue.statusCode).toBe(200);
    expect(last('moderationQueue')).toEqual(['cmy_1', 'spc_1', ACTOR]);
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
    expect(last('listOwn')).toEqual(['cmy_1', { page: 2, pageSize: 5 }, ACTOR]);
    expect(last('listBookmarked')).toEqual(['cmy_1', { page: 1, pageSize: 20 }, ACTOR]);
  });

  it('unschedules a post for its author and answers 409 when it is not scheduled', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/member/posts/pst_1/unschedule' });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: 'conflict', message: 'This post is not scheduled' });
    expect(last('unschedule')).toEqual(['pst_1', ACTOR]);
  });

  it('answers 503 when the scheduled time could not be set', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/member/posts/pst_1/schedule',
      payload: { scheduledAt: '2030-01-01T09:00:00Z' },
    });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({
      error: 'unavailable',
      message: 'The post could not be scheduled; try again',
      details: { postId: 'pst_1' },
    });
    expect(last('schedule')).toEqual(['pst_1', new Date('2030-01-01T09:00:00Z'), ACTOR]);
  });

  it('accepts only a dismissal when resolving post flags', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/member/posts/pst_1/flags/resolve',
      payload: { resolution: 'removed' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('clears a post reaction with DELETE and answers the counts', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/api/member/posts/pst_1/reaction' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ reactions: {} });
    expect(last('setPostReaction')).toEqual(['pst_1', null, ACTOR]);
  });

  it('answers 403 to a signed-in person who is not in the organization', async () => {
    orgUser = null;
    try {
      const res = await app.inject({ method: 'GET', url: '/api/member/communities/cmy_1/feed' });
      expect(res.statusCode).toBe(403);
    } finally {
      orgUser = ORG_USER;
    }
  });
});
