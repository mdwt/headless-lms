import { afterEach, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  ALL_PERMISSIONS,
  DEFAULT_ROLES,
  catalogOf,
  resolveOrgRoles,
  resolvePermissions,
} from '@headless-lms/core/organizations';
import type { Permission } from '@headless-lms/core/types';
import type { AccessRequest } from '@headless-lms/core/types';
import type { Container } from '../../app/container.js';
import { registerMcp } from './route.js';
import { fakeContainer } from './test-support.js';
import { defineTool, type Tool } from './tool.js';

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

const ran: string[] = [];

function probe(name: string, kind: Tool['kind']) {
  return defineTool({
    name,
    title: name,
    description: name,
    kind,
    idempotent: kind !== 'write',
    openWorld: false,
    input: z.object({}),
    call: () => (ran.push(name), { ran: name }),
  });
}

const PROBES = [
  probe('read_x', 'read'),
  probe('write_x', 'write'),
  probe('delete_x', 'destructive'),
];

async function build(container: Container, tools: Tool[] = PROBES) {
  app = Fastify();
  registerMcp(app, container, tools);
  await app.ready();
  return app;
}

const roles = new Map(resolveOrgRoles(catalogOf(DEFAULT_ROLES), []).map((r) => [r.key, r]));

const granted = (scopes: string[], roleKey = 'owner') =>
  fakeContainer({
    auth: {
      verifyAccess: async () => ({ userId: 'usr_1', orgId: 'org_1', scopes, clientId: 'client_1' }),
    },
    organizations: {
      actorFor: async (orgId: string, orgUserId: string, tokenScopes?: Permission[]) => ({
        id: orgUserId,
        orgId,
        permissions: resolvePermissions({
          assignments: [{ roleKey, contentId: null, contentType: null }],
          roles,
          ...(tokenScopes && { tokenScopes }),
        }),
      }),
    },
  });

const legacyHeaders = {
  'content-type': 'application/json',
  accept: 'application/json, text/event-stream',
  'mcp-protocol-version': '2025-11-25',
  authorization: 'Bearer token',
};
const listPayload = { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} };
const parseSse = (text: string) =>
  JSON.parse(
    text
      .split('\n')
      .find((line) => line.startsWith('data: '))!
      .slice(6),
  );

async function listed(container: Container, tools?: Tool[]) {
  const server = await build(container, tools);
  const res = await server.inject({
    method: 'POST',
    url: '/mcp',
    headers: legacyHeaders,
    payload: listPayload,
  });
  expect(res.statusCode).toBe(200);
  return parseSse(res.body).result.tools.map((tool: { name: string }) => tool.name);
}

describe('POST /mcp credentials', () => {
  it('challenges a request without a valid credential, naming every scope', async () => {
    const server = await build(fakeContainer({ auth: { verifyAccess: async () => null } }));
    const res = await server.inject({
      method: 'POST',
      url: '/mcp',
      headers: legacyHeaders,
      payload: listPayload,
    });
    expect(res.statusCode).toBe(401);
    expect(res.headers['www-authenticate']).toBe(
      `Bearer resource_metadata="http://localhost:8100/.well-known/oauth-protected-resource/mcp", scope="${ALL_PERMISSIONS.join(' ')}"`,
    );
  });

  async function refused(container: Container) {
    const server = await build(container);
    const res = await server.inject({
      method: 'POST',
      url: '/mcp',
      headers: legacyHeaders,
      payload: listPayload,
    });
    expect(res.statusCode).toBe(403);
    expect(res.headers['www-authenticate']).toBeUndefined();
    expect(res.json()).toEqual({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Only active members of this organization can use this server',
      },
      id: null,
    });
  }

  it('refuses a person who is not an active member without a challenge', async () => {
    await refused(fakeContainer({ organizations: { actorFor: async () => null } }));
  });

  it('refuses a person with no org user in the org without a challenge', async () => {
    await refused(fakeContainer({ organizations: { getOrgUser: async () => null } }));
  });

  it('refuses a grant for an organization that does not exist without a challenge', async () => {
    await refused(fakeContainer({ organizations: { getByExternalId: async () => null } }));
  });

  it('verifies the credential against the public resource URL, not the Host header', async () => {
    const seen: AccessRequest[] = [];
    const server = await build(
      fakeContainer({
        auth: {
          verifyAccess: async (request: AccessRequest) => {
            seen.push(request);
            return null;
          },
        },
      }),
    );
    await server.inject({
      method: 'POST',
      url: '/mcp',
      headers: {
        ...legacyHeaders,
        host: 'internal:3000',
        authorization: 'DPoP token',
        dpop: 'proof',
      },
      payload: listPayload,
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ method: 'POST', url: 'http://localhost:8100/mcp' });
    expect(seen[0]?.headers).toMatchObject({ authorization: 'DPoP token', dpop: 'proof' });
  });
});

describe('POST /mcp tool list', () => {
  it('lists every tool to every member', async () => {
    expect(await listed(granted([], 'member'))).toEqual(['read_x', 'write_x', 'delete_x']);
  });

  it('runs a tool', async () => {
    ran.length = 0;
    const server = await build(granted(['roles:read']));
    const res = await server.inject({
      method: 'POST',
      url: '/mcp',
      headers: legacyHeaders,
      payload: {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'read_x', arguments: {} },
      },
    });
    expect(parseSse(res.body).result.structuredContent).toEqual({ ran: 'read_x' });
    expect(ran).toEqual(['read_x']);
  });

  it('serves a 2026-07-28 client', async () => {
    const server = await build(granted(['roles:read']));
    const res = await server.inject({
      method: 'POST',
      url: '/mcp',
      headers: {
        'content-type': 'application/json',
        'mcp-protocol-version': '2026-07-28',
        'mcp-method': 'tools/list',
        authorization: 'Bearer token',
      },
      payload: {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {
          _meta: {
            'io.modelcontextprotocol/protocolVersion': '2026-07-28',
            'io.modelcontextprotocol/clientCapabilities': {},
          },
        },
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().result.tools.map((tool: { name: string }) => tool.name)).toEqual([
      'read_x',
      'write_x',
      'delete_x',
    ]);
  });
});

describe('other methods on /mcp', () => {
  it('answers 405 to GET and DELETE', async () => {
    const server = await build(fakeContainer());
    for (const method of ['GET', 'DELETE'] as const) {
      const res = await server.inject({ method, url: '/mcp' });
      expect(res.statusCode).toBe(405);
      expect(res.headers.allow).toBe('POST');
    }
  });
});
