import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { NotFoundError } from '@headless-lms/core/shared/errors';
import type { Container } from '../../../app/container.js';
import { registerAuth } from '../../plugins/auth.js';
import { errorHandler } from '../../plugins/error-handler.js';
import { mcpEndpoints } from '../../../app/mcp-endpoints.js';
import { memberNotificationRoutes } from './notifications.js';

const ORG = { id: 'org_1', name: 'Acme', slug: 'acme', externalId: 'org_1' };
const ORG_USER = { id: 'ou_sarah', role: 'student', userId: 'usr_1' };
const calls: { method: string; args: unknown[] }[] = [];

const item = {
  id: 'ntf_1',
  type: 'comment.created',
  scope: 'space',
  reasons: ['post_author', 'thread_participant'],
  category: 'comments_on_my_posts',
  display: { postTitle: 'My first recording', commenterName: 'James', excerpt: 'Nice' },
  community: { id: 'cmy_1', title: 'Spring cohort' },
  space: { id: 'spc_2', name: 'Practice' },
  actor: { orgUserId: 'ou_2', name: 'James', imageUrl: null },
  subject: { type: 'comment', id: 'cmt_1', excerpt: 'Nice' },
  parent: { type: 'post', id: 'pst_1', title: 'My first recording' },
  createdAt: '2026-11-01T09:00:00.000Z',
  readAt: null,
};

function record(method: string, result: (...args: unknown[]) => unknown = () => undefined) {
  return async (...args: unknown[]) => {
    calls.push({ method, args });
    return result(...args);
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
    getOrgUser: async () => ORG_USER,
  },
  identity: { getUserByExternalId: async () => ({ id: 'usr_1' }) },
  reporting: {
    member: {
      notifications: record('notifications', () => ({
        rows: [item],
        total: 1,
        page: 1,
        pageSize: 20,
        unreadCount: 1,
      })),
      notificationUnreadCounts: record('unreadCounts', () => ({
        org: 2,
        communities: [{ communityId: 'cmy_1', unread: 1 }],
      })),
    },
  },
  notificationList: {
    markRead: record('markRead', (_orgId, _userId, id) => {
      if (id !== 'ntf_1') {
        throw new NotFoundError('Notification', String(id));
      }
    }),
    markAllRead: record('markAllRead', () => ({ marked: 3 })),
  },
} as unknown as Container;

let app: FastifyInstance;

beforeAll(async () => {
  app = Fastify();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.setErrorHandler(errorHandler);
  registerAuth(app, container);
  await memberNotificationRoutes(app, container);
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  calls.length = 0;
});

function last(method: string) {
  return calls.filter((call) => call.method === method).at(-1)?.args;
}

describe('member notification routes', () => {
  it('lists with the filters read from the query string', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/member/notifications?communityId=cmy_1&reason=comment_author,thread_participant&category=mentions&type=mention,comment.created&unread=true&page=2&pageSize=10',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ rows: [item], total: 1, page: 1, pageSize: 20, unreadCount: 1 });
    expect(last('notifications')).toEqual([
      'org_1',
      ORG_USER,
      'usr_1',
      {
        communityId: 'cmy_1',
        reason: ['comment_author', 'thread_participant'],
        category: ['mentions'],
        type: ['mention', 'comment.created'],
        unread: true,
      },
      { page: 2, pageSize: 10 },
    ]);
  });

  it('lists with no filters and reads unread=false as false', async () => {
    await app.inject({ method: 'GET', url: '/api/member/notifications?unread=false&scope=org' });
    expect(last('notifications')?.[3]).toEqual({ unread: false, scope: 'org' });
  });

  it('refuses an unknown reason or scope', async () => {
    const reason = await app.inject({
      method: 'GET',
      url: '/api/member/notifications?reason=friend',
    });
    expect(reason.statusCode).toBe(400);
    const scope = await app.inject({ method: 'GET', url: '/api/member/notifications?scope=space' });
    expect(scope.statusCode).toBe(400);
    expect(calls).toEqual([]);
  });

  it('refuses scope=org together with a community, on the list and on mark-read', async () => {
    const list = await app.inject({
      method: 'GET',
      url: '/api/member/notifications?scope=org&communityId=cmy_1',
    });
    expect(list.statusCode).toBe(400);
    const read = await app.inject({
      method: 'POST',
      url: '/api/member/notifications/read?scope=org&communityId=cmy_1',
    });
    expect(read.statusCode).toBe(400);
    expect(calls).toEqual([]);
    const community = await app.inject({
      method: 'GET',
      url: '/api/member/notifications?scope=community&communityId=cmy_1',
    });
    expect(community.statusCode).toBe(200);
  });

  it('serves the unread counts', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/member/notifications/unread-counts',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ org: 2, communities: [{ communityId: 'cmy_1', unread: 1 }] });
    expect(last('unreadCounts')).toEqual(['org_1', ORG_USER, 'usr_1']);
  });

  it('marks one notification read with 204, and 404 when it is not yours', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/member/notifications/ntf_1/read',
    });
    expect(res.statusCode).toBe(204);
    expect(last('markRead')).toEqual(['org_1', 'usr_1', 'ntf_1']);
    const missing = await app.inject({
      method: 'POST',
      url: '/api/member/notifications/ntf_x/read',
    });
    expect(missing.statusCode).toBe(404);
  });

  it('marks the notifications matching the filters read', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/member/notifications/read?category=followed_posts,new_posts',
    });
    expect(res.statusCode).toBe(204);
    expect(last('markAllRead')).toEqual([
      'org_1',
      'usr_1',
      { category: ['followed_posts', 'new_posts'] },
    ]);
  });
});
