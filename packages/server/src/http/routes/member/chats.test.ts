import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { ForbiddenError, NotFoundError, UnavailableError } from '@headless-lms/core/shared/errors';
import { actorWith } from '@headless-lms/core/organizations';
import type { ChatLiveEvent } from '@headless-lms/core/discussion';
import type { Container } from '../../../app/container.js';
import { registerAuth } from '../../plugins/auth.js';
import { errorHandler } from '../../plugins/error-handler.js';
import { mcpEndpoints } from '../../../app/mcp-endpoints.js';
import { memberChatRoutes } from './chats.js';
import { resolvedCaller } from '../../test-caller.js';

const ORG = { id: 'org_1', name: 'Spanish in 90 Days', slug: 'spanish', externalId: 'org_1' };
const USER = { id: 'usr_sarah', externalId: 'usr_sarah' };
const ORG_USER = { id: 'ou_sarah', orgId: ORG.id, userId: USER.id };
const ACTOR = actorWith({ id: ORG_USER.id, orgId: ORG.id });
const CHAT = {
  orgId: ORG.id,
  id: 'cht_1',
  communityId: 'cmy_1',
  kind: 'direct',
  status: 'open',
  createdBy: 'ou_sarah',
  lockedAt: null,
  lockedBy: null,
  createdAt: new Date('2026-11-05T09:00:00.000Z'),
  updatedAt: new Date('2026-11-05T09:00:00.000Z'),
};
const ITEM = {
  chat: CHAT,
  participantIds: ['ou_sarah'],
  participants: [
    {
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
  ],
  lastReadMessageId: null,
  subscription: null,
  unread: 0,
  lastMessage: null,
};

const calls: { method: string; args: unknown[] }[] = [];
let session: { user: { id: string }; session: { activeOrganizationId: string } } | null;
let orgUser: typeof ORG_USER | null;
let watched: (() => Promise<AsyncIterable<ChatLiveEvent>>) | null;

async function* events(list: ChatLiveEvent[]): AsyncIterable<ChatLiveEvent> {
  yield* list;
}

const container = {
  mcp: mcpEndpoints({
    authBaseURL: 'https://lms.example.com',
    adminAppUrl: 'https://admin.example.com',
  }),
  requestContext: { set: () => {} },
  auth: {
    verify: async () => session,
  },
  organizations: {
    getByExternalId: async () => ORG,
    getOrgUser: async () => orgUser,
    actorFor: async () => ACTOR,
    resolveCaller: async () => resolvedCaller(ORG, USER, orgUser, ACTOR),
  },
  identity: {
    getUserByExternalId: async () => USER,
  },
  chats: {
    listChats: async (...args: unknown[]) => {
      calls.push({ method: 'listChats', args });
      return { rows: [ITEM], total: 1, page: 1, pageSize: 20 };
    },
    send: async (...args: unknown[]) => {
      calls.push({ method: 'send', args });
      throw new ForbiddenError('You cannot send in this chat');
    },
    chat: async (...args: unknown[]) => {
      calls.push({ method: 'chat', args });
      if (args[0] === 'missing') {
        throw new NotFoundError('Chat', 'missing');
      }
      return ITEM;
    },
    directChat: async (...args: unknown[]) => {
      calls.push({ method: 'directChat', args });
      if (args[1] === 'ou_nobody') {
        throw new NotFoundError('Chat', 'ou_nobody');
      }
      return ITEM;
    },
    unreadSummary: async (...args: unknown[]) => {
      calls.push({ method: 'unreadSummary', args });
      return { unread: 3, requests: 1 };
    },
    typing: async (...args: unknown[]) => {
      calls.push({ method: 'typing', args });
    },
    watch: async (...args: unknown[]) => {
      calls.push({ method: 'watch', args });
      if (!watched) {
        throw new UnavailableError('Live chat is not available');
      }
      return watched();
    },
  },
} as unknown as Container;

let app: FastifyInstance;

beforeAll(async () => {
  app = Fastify();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.setErrorHandler(errorHandler);
  app.addHook('onRequest', async (_req, reply) => {
    reply.header('access-control-allow-origin', 'https://community.example.com');
  });
  registerAuth(app, container);
  await memberChatRoutes(app, container);
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  calls.length = 0;
  session = { user: { id: USER.id }, session: { activeOrganizationId: ORG.id } };
  orgUser = ORG_USER;
  watched = null;
});

function last(method: string) {
  return calls.filter((call) => call.method === method).at(-1)?.args;
}

describe('member chat routes', () => {
  it('lists only the requests, everything else, or every chat', async () => {
    for (const [query, expected] of [
      ['?requests=true', { page: 1, pageSize: 20, requests: true }],
      ['?requests=false', { page: 1, pageSize: 20, requests: false }],
      ['', { page: 1, pageSize: 20 }],
    ] as const) {
      const res = await app.inject({
        method: 'GET',
        url: `/api/member/communities/cmy_1/chats${query}`,
      });
      expect(res.statusCode).toBe(200);
      expect(last('listChats')).toEqual(['cmy_1', expected, ACTOR]);
    }
    const list = await app.inject({ method: 'GET', url: '/api/member/communities/cmy_1/chats' });
    expect(list.json().rows[0].participants[0].firstName).toBe('Sarah');
    const bad = await app.inject({
      method: 'GET',
      url: '/api/member/communities/cmy_1/chats?requests=maybe',
    });
    expect(bad.statusCode).toBe(400);
  });

  it('passes a send its client id', async () => {
    const clientId = '0f6c2a8e-3b1d-4c8e-9a51-6d2f0b7e4c13';
    await app.inject({
      method: 'POST',
      url: '/api/member/chats/cht_1/messages',
      payload: { body: 'Hola', clientId },
    });
    expect(last('send')).toEqual([
      'cht_1',
      { body: 'Hola', replyToId: null, assetIds: [], clientId },
      ACTOR,
    ]);
    const bad = await app.inject({
      method: 'POST',
      url: '/api/member/chats/cht_1/messages',
      payload: { body: 'Hola', clientId: 'not-a-uuid' },
    });
    expect(bad.statusCode).toBe(400);
  });

  it('reads one chat, the direct chat with a person, and the unread total', async () => {
    const chat = await app.inject({ method: 'GET', url: '/api/member/chats/cht_1' });
    expect(chat.statusCode).toBe(200);
    expect(chat.json().chat.id).toBe('cht_1');
    expect(last('chat')).toEqual(['cht_1', ACTOR]);
    expect((await app.inject({ method: 'GET', url: '/api/member/chats/missing' })).statusCode).toBe(
      404,
    );

    const direct = await app.inject({
      method: 'GET',
      url: '/api/member/communities/cmy_1/chats/direct/ou_james',
    });
    expect(direct.statusCode).toBe(200);
    expect(last('directChat')).toEqual(['cmy_1', 'ou_james', ACTOR]);
    const none = await app.inject({
      method: 'GET',
      url: '/api/member/communities/cmy_1/chats/direct/ou_nobody',
    });
    expect(none.statusCode).toBe(404);

    const unread = await app.inject({
      method: 'GET',
      url: '/api/member/communities/cmy_1/chats/unread',
    });
    expect(unread.json()).toEqual({ unread: 3, requests: 1 });
    expect(last('unreadSummary')).toEqual(['cmy_1', ACTOR]);
  });

  it('sends typing with no body', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/member/chats/cht_1/typing' });
    expect(res.statusCode).toBe(204);
    expect(last('typing')).toEqual(['cht_1', ACTOR]);
  });

  it('answers 401 without a session and 503 without live delivery on the stream', async () => {
    const url = '/api/member/communities/cmy_1/chats/events';
    session = null;
    expect((await app.inject({ method: 'GET', url })).statusCode).toBe(401);
    expect(last('watch')).toBeUndefined();
    session = { user: { id: USER.id }, session: { activeOrganizationId: ORG.id } };
    const res = await app.inject({ method: 'GET', url });
    expect(res.statusCode).toBe(503);
    expect(res.headers['content-type']).toContain('application/json');
  });

  it('answers 403 on the stream when the service refuses', async () => {
    watched = async () => {
      throw new ForbiddenError('You are not a member of this community');
    };
    const res = await app.inject({
      method: 'GET',
      url: '/api/member/communities/cmy_1/chats/events',
    });
    expect(res.statusCode).toBe(403);
  });

  it('streams each event as a frame whose data carries its type', async () => {
    watched = async () =>
      events([
        { type: 'ready', heartbeatMs: 25000 },
        { type: 'unread', unread: 3, requests: 1 },
        {
          type: 'typing',
          chatId: 'cht_1',
          orgUserId: 'ou_james',
          until: new Date('2026-11-05T09:00:05.000Z'),
        },
        { type: 'closed', reason: 'shutdown' },
      ]);
    const res = await app.inject({
      method: 'GET',
      url: '/api/member/communities/cmy_1/chats/events',
      headers: { 'x-request-id': 'req-1' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('text/event-stream; charset=utf-8');
    expect(res.headers['cache-control']).toBe('no-cache, no-transform');
    expect(res.headers['x-accel-buffering']).toBe('no');
    expect(res.headers['access-control-allow-origin']).toBe('https://community.example.com');
    expect(res.body).toBe(
      [
        'event: ready\ndata: {"type":"ready","heartbeatMs":25000}\n\n',
        'event: unread\ndata: {"type":"unread","unread":3,"requests":1}\n\n',
        'event: typing\ndata: {"type":"typing","chatId":"cht_1","orgUserId":"ou_james","until":"2026-11-05T09:00:05.000Z"}\n\n',
        'event: closed\ndata: {"type":"closed","reason":"shutdown"}\n\n',
      ].join(''),
    );
  });
});
