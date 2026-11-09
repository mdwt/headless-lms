import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import type { Container } from '../../app/container.js';
import { registerAuth } from '../plugins/auth.js';
import { errorHandler } from '../plugins/error-handler.js';
import { communityModerationRoutes } from './community-moderation.js';
import { mcpEndpoints } from '../../app/mcp-endpoints.js';
import { actorWith } from '@headless-lms/core/organizations';
import type { Actor } from '@headless-lms/core/shared/actor';
import { NotFoundError } from '@headless-lms/core/shared/errors';
import { resolvedCaller } from '../test-caller.js';

const ORG = { id: 'org_1', name: 'Acme', slug: 'acme', externalId: 'org_1' };
const AT = '2026-10-29T12:00:00.000Z';
const EMMA = actorWith({
  id: 'ou_emma',
  orgId: ORG.id,
  content: { cmy_1: ['communities:moderate'] },
});
const calls: { method: string; args: unknown[] }[] = [];
const orgUser = { id: 'ou_emma', orgId: ORG.id };
let actor: Actor | null = EMMA;
let membersPage: unknown = { rows: [], total: 0, page: 1, pageSize: 20 };

function record(method: string, result: (...args: unknown[]) => unknown) {
  return async (...args: unknown[]) => {
    calls.push({ method, args });
    return result(...args);
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
  mcp: mcpEndpoints({
    authBaseURL: 'https://lms.example.com',
    adminAppUrl: 'https://admin.example.com',
  }),
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
    actorFor: async () => actor,
    resolveCaller: async () => resolvedCaller(ORG, { id: 'usr_1' }, orgUser, actor),
  },
  identity: { getUserByExternalId: async () => ({ id: 'usr_1' }) },
  requestContext: { set: () => {} },
  reporting: {
    admin: {
      communityMembers: record('communityMembers', (communityId) => {
        if (communityId === 'cmy_x') {
          throw new NotFoundError('Community', 'cmy_x');
        }
        return membersPage;
      }),
    },
  },
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
  actor = EMMA;
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
          team: false,
          roleName: null,
          opensEverySpace: false,
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
      'cmy_1',
      { page: 2, pageSize: 5, search: 'sarah' },
      EMMA,
    ]);
  });

  it('answers 404 for a community that does not exist', async () => {
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

  it('manages space membership as the caller', async () => {
    const list = await app.inject({
      method: 'GET',
      url: '/api/communities/cmy_1/spaces/spc_1/members?page=2&pageSize=10',
    });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toMatchObject({ total: 1, page: 2, pageSize: 10 });
    expect(last('listSpaceMembers')).toEqual(['cmy_1', 'spc_1', { page: 2, pageSize: 10 }, EMMA]);
    for (const [path, method] of [
      ['members', 'addSpaceMember'],
      ['invites', 'invite'],
    ] as const) {
      const res = await app.inject({
        method: 'POST',
        url: `/api/communities/cmy_1/spaces/spc_1/${path}`,
        payload: { orgUserId: 'ou_sarah' },
      });
      expect(res.statusCode).toBe(201);
      expect(last(method)).toEqual(['cmy_1', 'spc_1', 'ou_sarah', EMMA]);
    }
    for (const [action, method] of [
      ['approve', 'approveSpaceRequest'],
      ['decline', 'decline'],
      ['remove', 'removeSpaceMember'],
    ] as const) {
      const res = await app.inject({
        method: 'POST',
        url: `/api/communities/cmy_1/spaces/spc_1/members/ou_sarah/${action}`,
      });
      expect(res.statusCode).toBe(200);
      expect(last(method)).toEqual(['cmy_1', 'spc_1', 'ou_sarah', EMMA]);
    }
  });

  it('passes the community of the path to the queue and every flag resolution', async () => {
    const queue = await app.inject({
      method: 'GET',
      url: '/api/communities/cmy_1/spaces/spc_1/queue',
    });
    expect(queue.statusCode).toBe(200);
    expect(last('moderationQueue')).toEqual(['cmy_1', 'spc_1', EMMA]);
    const post = await app.inject({
      method: 'POST',
      url: '/api/communities/cmy_1/posts/pst_1/flags/resolve',
      payload: { resolution: 'dismissed' },
    });
    const comment = await app.inject({
      method: 'POST',
      url: '/api/communities/cmy_1/comments/cmt_1/flags/resolve',
      payload: { resolution: 'dismissed' },
    });
    const message = await app.inject({
      method: 'POST',
      url: '/api/communities/cmy_1/messages/msg_1/flags/resolve',
      payload: { resolution: 'dismissed' },
    });
    expect([post.statusCode, comment.statusCode, message.statusCode]).toEqual([204, 204, 204]);
    expect(last('resolvePostFlags')).toEqual(['pst_1', 'dismissed', 'cmy_1', EMMA]);
    expect(last('resolveReports')).toEqual(['cmt_1', { communityId: 'cmy_1' }, EMMA]);
    expect(last('resolveMessageFlags')).toEqual(['msg_1', 'dismissed', 'cmy_1', EMMA]);
  });

  it('refuses a person who is not an active member of the organization', async () => {
    actor = null;
    const res = await app.inject({
      method: 'POST',
      url: '/api/communities/cmy_1/spaces/spc_1/members/ou_sarah/approve',
    });
    expect(res.statusCode).toBe(403);
    expect(calls).toHaveLength(0);
  });
});
