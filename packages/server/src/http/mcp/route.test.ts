import { afterEach, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ACCESS_SCOPES } from '@headless-lms/core/organizations';
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

function probe(name: string, scope: Tool['scope'], kind: Tool['kind']) {
  return defineTool({
    name,
    title: name,
    description: name,
    scope,
    kind,
    idempotent: kind !== 'write',
    openWorld: false,
    input: z.object({}),
    call: () => (ran.push(name), { ran: name }),
  });
}

const PROBES = [
  probe('read_x', 'courses:read', 'read'),
  probe('write_x', 'courses:write', 'write'),
  probe('delete_x', 'courses:delete', 'destructive'),
];

async function build(container: Container) {
  app = Fastify();
  registerMcp(app, container, PROBES);
  await app.ready();
  return app;
}

const granted = (scopes: string[], role = 'owner') =>
  fakeContainer({
    auth: { verifyAccess: async () => ({ userId: 'usr_1', orgId: 'org_1', scopes, clientId: 'client_1' }) },
    organizations: { getOrgUser: async () => ({ id: 'ou_1', orgId: 'org_1', userId: 'usr_1', role }) },
  });

const legacyHeaders = {
  'content-type': 'application/json',
  accept: 'application/json, text/event-stream',
  'mcp-protocol-version': '2025-11-25',
  authorization: 'Bearer token',
};
const listPayload = { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} };
const parseSse = (text: string) =>
  JSON.parse(text.split('\n').find((line) => line.startsWith('data: '))!.slice(6));

async function listed(container: Container) {
  const server = await build(container);
  const res = await server.inject({ method: 'POST', url: '/mcp', headers: legacyHeaders, payload: listPayload });
  expect(res.statusCode).toBe(200);
  return parseSse(res.body).result.tools.map((tool: { name: string }) => tool.name);
}

describe('POST /mcp credentials', () => {
  it('challenges a request without a valid credential, naming every scope', async () => {
    const server = await build(fakeContainer({ auth: { verifyAccess: async () => null } }));
    const res = await server.inject({ method: 'POST', url: '/mcp', headers: legacyHeaders, payload: listPayload });
    expect(res.statusCode).toBe(401);
    expect(res.headers['www-authenticate']).toBe(
      `Bearer resource_metadata="http://localhost:8100/.well-known/oauth-protected-resource/mcp", scope="${ACCESS_SCOPES.join(' ')}"`,
    );
  });

  it('challenges a person who is a student in the org', async () => {
    const server = await build(granted([...ACCESS_SCOPES], 'student'));
    const res = await server.inject({ method: 'POST', url: '/mcp', headers: legacyHeaders, payload: listPayload });
    expect(res.statusCode).toBe(401);
  });

  it('challenges a person with no org user in the org', async () => {
    const server = await build(fakeContainer({ organizations: { getOrgUser: async () => null } }));
    const res = await server.inject({ method: 'POST', url: '/mcp', headers: legacyHeaders, payload: listPayload });
    expect(res.statusCode).toBe(401);
  });

  it('challenges a grant for an organization that does not exist', async () => {
    const server = await build(fakeContainer({ organizations: { getByExternalId: async () => null } }));
    const res = await server.inject({ method: 'POST', url: '/mcp', headers: legacyHeaders, payload: listPayload });
    expect(res.statusCode).toBe(401);
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
      headers: { ...legacyHeaders, host: 'internal:3000', authorization: 'DPoP token', dpop: 'proof' },
      payload: listPayload,
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ method: 'POST', url: 'http://localhost:8100/mcp' });
    expect(seen[0]?.headers).toMatchObject({ authorization: 'DPoP token', dpop: 'proof' });
  });
});

describe('POST /mcp tool list', () => {
  it('lists only the tools whose scope was granted', async () => {
    expect(await listed(granted(['courses:read', 'courses:write']))).toEqual(['read_x', 'write_x']);
  });

  it('hides delete tools unless their scope was granted', async () => {
    expect(await listed(granted(['courses:read']))).toEqual(['read_x']);
    expect(await listed(granted(['courses:read', 'courses:delete']))).toEqual(['read_x', 'delete_x']);
  });

  it('never lists a tool the role cannot hold, whatever was granted', async () => {
    expect(await listed(granted(['courses:read', 'courses:write', 'courses:delete'], 'instructor'))).toEqual(['read_x']);
  });

  it('lists no tools when the filter leaves none', async () => {
    expect(await listed(granted(['courses:write'], 'instructor'))).toEqual([]);
  });

  it('does not run a tool outside the list', async () => {
    ran.length = 0;
    const server = await build(granted(['courses:read']));
    const res = await server.inject({
      method: 'POST',
      url: '/mcp',
      headers: legacyHeaders,
      payload: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'write_x', arguments: {} } },
    });
    const body = parseSse(res.body);
    expect(body.error ?? body.result?.isError).toBeTruthy();
    expect(ran).toEqual([]);
  });

  it('runs a granted tool', async () => {
    ran.length = 0;
    const server = await build(granted(['courses:read']));
    const res = await server.inject({
      method: 'POST',
      url: '/mcp',
      headers: legacyHeaders,
      payload: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'read_x', arguments: {} } },
    });
    expect(parseSse(res.body).result.structuredContent).toEqual({ ran: 'read_x' });
    expect(ran).toEqual(['read_x']);
  });

  it('serves a 2026-07-28 client', async () => {
    const server = await build(granted(['courses:read']));
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
    expect(res.json().result.tools.map((tool: { name: string }) => tool.name)).toEqual(['read_x']);
  });

  it('lists no tools to a 2026-07-28 client when the filter leaves none', async () => {
    const server = await build(granted(['courses:write'], 'instructor'));
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
    expect(res.json().result.tools).toEqual([]);
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
