import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { NotFoundError } from '@headless-lms/core/shared/errors';
import type { Container } from '../../../app/container.js';
import { registerAuth } from '../../plugins/auth.js';
import { errorHandler } from '../../plugins/error-handler.js';
import { mcpEndpoints } from '../../../app/mcp-endpoints.js';
import { memberChatRoutes } from './chats.js';
import { memberCommunityRoutes } from './community.js';
import { memberPostRoutes } from './posts.js';

const ORG = { id: 'org_1', name: 'Acme', slug: 'acme', externalId: 'org_1' };
const ORG_USER = { id: 'ou_emma', role: 'student' };
const calls: { method: string; args: unknown[] }[] = [];

function record(method: string) {
  return async (...args: unknown[]) => {
    calls.push({ method, args });
    if (args[2] === 'missing') {
      throw new NotFoundError('Item', 'missing');
    }
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
  subscriptions: {
    setPost: record('setPost'),
    setSpace: record('setSpace'),
    setChat: record('setChat'),
  },
} as unknown as Container;

let app: FastifyInstance;

beforeAll(async () => {
  app = Fastify();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.setErrorHandler(errorHandler);
  registerAuth(app, container);
  await memberPostRoutes(app, container);
  await memberCommunityRoutes(app, container);
  await memberChatRoutes(app, container);
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

function last(method: string) {
  return calls.filter((call) => call.method === method).at(-1)?.args;
}

describe('member subscription routes', () => {
  it('follows, mutes until a time, and clears a post', async () => {
    for (const payload of [
      { state: 'following' },
      { state: 'muted', mutedUntil: '2030-01-01T00:00:00Z' },
      { state: 'none' },
    ]) {
      const res = await app.inject({
        method: 'PUT',
        url: '/api/member/posts/pst_1/subscription',
        payload,
      });
      expect(res.statusCode).toBe(204);
    }
    expect(calls.filter((call) => call.method === 'setPost').map((call) => call.args)).toEqual([
      [ORG.id, ORG_USER, 'pst_1', { state: 'following' }],
      [ORG.id, ORG_USER, 'pst_1', { state: 'muted', mutedUntil: new Date('2030-01-01T00:00:00Z') }],
      [ORG.id, ORG_USER, 'pst_1', { state: 'none' }],
    ]);
  });

  it('mutes a space and a chat, and refuses to follow either', async () => {
    const space = await app.inject({
      method: 'PUT',
      url: '/api/member/spaces/spc_1/subscription',
      payload: { state: 'muted' },
    });
    const chat = await app.inject({
      method: 'PUT',
      url: '/api/member/chats/cht_1/subscription',
      payload: { state: 'none' },
    });
    expect([space.statusCode, chat.statusCode]).toEqual([204, 204]);
    expect(last('setSpace')).toEqual([ORG.id, ORG_USER, 'spc_1', { state: 'muted' }]);
    expect(last('setChat')).toEqual([ORG.id, ORG_USER, 'cht_1', { state: 'none' }]);
    const before = calls.length;
    for (const url of [
      '/api/member/spaces/spc_1/subscription',
      '/api/member/chats/cht_1/subscription',
    ]) {
      const res = await app.inject({ method: 'PUT', url, payload: { state: 'following' } });
      expect(res.statusCode).toBe(400);
    }
    expect(calls).toHaveLength(before);
  });

  it('refuses an end time on anything but a mute', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/member/posts/pst_1/subscription',
      payload: { state: 'following', mutedUntil: '2030-01-01T00:00:00Z' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('answers 404 for an item the person cannot open', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/member/spaces/missing/subscription',
      payload: { state: 'muted' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('no longer serves the follow and mute routes', async () => {
    for (const [method, url] of [
      ['POST', '/api/member/posts/pst_1/follow'],
      ['DELETE', '/api/member/posts/pst_1/follow'],
      ['POST', '/api/member/chats/cht_1/mute'],
      ['POST', '/api/member/chats/cht_1/unmute'],
    ] as const) {
      expect((await app.inject({ method, url })).statusCode).toBe(404);
    }
  });
});
