import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import type { Container } from '../../app/container.js';
import { registerAuth } from '../plugins/auth.js';
import { errorHandler } from '../plugins/error-handler.js';
import { communityModerationRoutes } from './community-moderation.js';

const ORG = { id: 'org_1', name: 'Acme', slug: 'acme', externalId: 'org_1' };
const AT = '2026-10-29T12:00:00.000Z';
const STAFF = { id: 'ou_staff', role: 'admin' };
const calls: { method: string; args: unknown[] }[] = [];
let orgUser = { id: 'ou_staff', orgId: ORG.id, role: 'admin' };
let membersPage: unknown = { rows: [], total: 0, page: 1, pageSize: 20 };

function record(method: string, result: () => unknown) {
  return async (...args: unknown[]) => {
    calls.push({ method, args });
    return result();
  };
}

const spaceMember = {
  orgId: ORG.id,
  id: 'spm_1',
  spaceId: 'spc_1',
  communityId: 'cmy_1',
  orgUserId: 'ou_sarah',
  status: 'active',
  source: 'request',
  createdAt: AT,
  updatedAt: AT,
};

const container = {
  auth: {
    verify: async () => ({
      user: { id: 'usr_1', email: 'a@b.c' },
      session: { activeOrganizationId: ORG.id },
    }),
  },
  organizations: {
    getByExternalId: async () => ORG,
    getById: async () => ORG,
    getOrgUser: async () => orgUser,
  },
  identity: { getUserByExternalId: async () => ({ id: 'usr_1' }) },
  requestContext: { set: () => {} },
  reporting: { admin: { communityMembers: record('communityMembers', () => membersPage) } },
  entitlements: {
    listSpaceMembers: record('listSpaceMembers', () => ({
      rows: [spaceMember],
      total: 1,
      page: 2,
      pageSize: 10,
    })),
    addSpaceMember: record('addSpaceMember', () => spaceMember),
    invite: record('invite', () => spaceMember),
    approve: record('approveSpaceRequest', () => spaceMember),
    decline: record('decline', () => spaceMember),
    remove: record('removeSpaceMember', () => spaceMember),
  },
  posts: {
    moderationQueue: record('moderationQueue', () => ({
      pending: [],
      flags: [],
      commentFlags: [],
    })),
    resolveFlags: record('resolvePostFlags', () => undefined),
  },
  discussion: { resolveReports: record('resolveReports', () => undefined) },
  chats: { resolveMessageFlags: record('resolveMessageFlags', () => undefined) },
} as unknown as Container;

let app: FastifyInstance;

beforeAll(async () => {
  app = Fastify();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.setErrorHandler(errorHandler);
  registerAuth(app, container);
  app.addHook('onRequest', app.requireOrgSession);
  await communityModerationRoutes(app, container);
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  calls.length = 0;
  orgUser = { id: 'ou_staff', orgId: ORG.id, role: 'admin' };
  membersPage = { rows: [], total: 0, page: 1, pageSize: 20 };
});

function last(method: string) {
  return calls.filter((call) => call.method === method).at(-1)?.args;
}

describe('community moderation routes', () => {
  it('lists the people who hold a community, paged and searched', async () => {
    membersPage = {
      rows: [
        {
          id: 'ou_sarah',
          firstName: 'Sarah',
          lastName: 'Jones',
          email: 'sarah@example.com',
          image: null,
          role: 'student',
        },
      ],
      total: 1,
      page: 2,
      pageSize: 5,
    };
    const res = await app.inject({
      method: 'GET',
      url: '/api/communities/cmy_1/members?page=2&pageSize=5&search=sarah',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(membersPage);
    expect(last('communityMembers')).toEqual([
      ORG.id,
      'cmy_1',
      { page: 2, pageSize: 5, search: 'sarah' },
    ]);
  });

  it('answers 404 for a community that does not exist', async () => {
    membersPage = null;
    const res = await app.inject({ method: 'GET', url: '/api/communities/cmy_x/members' });
    expect(res.statusCode).toBe(404);
  });

  it('refuses a sort it does not apply', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/communities/cmy_1/members?sort=email',
    });
    expect(res.statusCode).toBe(400);
  });

  it('manages space membership as the staff member', async () => {
    const list = await app.inject({
      method: 'GET',
      url: '/api/communities/cmy_1/spaces/spc_1/members?page=2&pageSize=10',
    });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toMatchObject({ total: 1, page: 2, pageSize: 10 });
    expect(last('listSpaceMembers')).toEqual([
      ORG.id,
      STAFF,
      'cmy_1',
      'spc_1',
      { page: 2, pageSize: 10 },
    ]);
    for (const [path, method] of [
      ['members', 'addSpaceMember'],
      ['invites', 'invite'],
      ['approvals', 'approveSpaceRequest'],
      ['declines', 'decline'],
      ['removals', 'removeSpaceMember'],
    ] as const) {
      const res = await app.inject({
        method: 'POST',
        url: `/api/communities/cmy_1/spaces/spc_1/${path}`,
        payload: { orgUserId: 'ou_sarah' },
      });
      expect(res.statusCode).toBe(200);
      expect(last(method)).toEqual([ORG.id, STAFF, 'cmy_1', 'spc_1', 'ou_sarah']);
    }
  });

  it('passes the community of the path to the queue and every flag resolution', async () => {
    const queue = await app.inject({
      method: 'GET',
      url: '/api/communities/cmy_1/spaces/spc_1/queue',
    });
    expect(queue.statusCode).toBe(200);
    expect(last('moderationQueue')).toEqual([ORG.id, STAFF, 'cmy_1', 'spc_1']);
    const post = await app.inject({
      method: 'POST',
      url: '/api/communities/cmy_1/posts/pst_1/flags/resolution',
      payload: { resolution: 'dismissed' },
    });
    const comment = await app.inject({
      method: 'POST',
      url: '/api/communities/cmy_1/comments/cmt_1/flags/resolution',
    });
    const message = await app.inject({
      method: 'POST',
      url: '/api/communities/cmy_1/messages/msg_1/flags/resolution',
      payload: { resolution: 'dismissed' },
    });
    expect([post.statusCode, comment.statusCode, message.statusCode]).toEqual([204, 204, 204]);
    expect(last('resolvePostFlags')).toEqual([ORG.id, 'pst_1', STAFF, 'dismissed', 'cmy_1']);
    expect(last('resolveReports')).toEqual([ORG.id, 'cmt_1', STAFF, 'cmy_1']);
    expect(last('resolveMessageFlags')).toEqual([ORG.id, STAFF, 'msg_1', 'dismissed', 'cmy_1']);
  });

  it('refuses a moderator, who works from the community app', async () => {
    orgUser = { id: 'ou_james', orgId: ORG.id, role: 'moderator' };
    const res = await app.inject({
      method: 'POST',
      url: '/api/communities/cmy_1/spaces/spc_1/approvals',
      payload: { orgUserId: 'ou_sarah' },
    });
    expect(res.statusCode).toBe(403);
    expect(calls).toHaveLength(0);
  });
});
