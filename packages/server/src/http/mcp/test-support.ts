import { expect } from 'vitest';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { ACCESS_SCOPES, type AccessScope, type StaffRole } from '@headless-lms/core/organizations';
import type { Container } from '../../app/container.js';
import { mcpEndpoints } from '../../app/mcp-endpoints.js';
import { createToolServer } from './server.js';
import { toToolResult, type Tool, type ToolContext, type ToolKind } from './tool.js';
import { TOOLS } from './tools/index.js';

export const ORG = { id: 'org_1', name: 'Acme', slug: 'acme', externalId: 'org_1' };
export const USER = { id: 'usr_1', email: 'owner@acme.test', firstName: 'Ada', lastName: 'Lovelace', externalId: 'usr_1' };
export const ORG_USER = { id: 'ou_1', orgId: 'org_1', userId: 'usr_1', role: 'owner' };

export function fakeContainer(overrides: Record<string, unknown> = {}): Container {
  const logger = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {}, child: () => logger };
  const base: Record<string, unknown> = {
    mcp: mcpEndpoints({ authBaseURL: 'http://localhost:8100', adminAppUrl: 'http://localhost:8101' }),
    logger,
    requestContext: { set: () => {}, run: (_ctx: unknown, fn: () => void) => fn() },
    auth: {
      verifyAccess: async () => ({ userId: USER.id, orgId: ORG.id, scopes: [...ACCESS_SCOPES], clientId: 'client_1' }),
    },
    organizations: {
      getById: async (id: string) => (id === ORG.id ? ORG : null),
      getByExternalId: async (id: string) => (id === ORG.externalId ? ORG : null),
      getOrgUser: async (orgId: string, userId: string) => (orgId === ORG.id && userId === USER.id ? ORG_USER : null),
    },
    identity: {
      getUserByExternalId: async (id: string) => (id === USER.id ? USER : null),
      getUserById: async (id: string) => (id === USER.id ? USER : null),
    },
  };
  for (const [key, value] of Object.entries(overrides)) {
    const current = base[key];
    base[key] =
      current && typeof current === 'object' && value && typeof value === 'object' && !Array.isArray(value)
        ? { ...(current as object), ...(value as object) }
        : value;
  }
  return base as unknown as Container;
}

export function toolContext(container: Container, role: StaffRole = 'owner'): ToolContext {
  return {
    container,
    scope: { orgId: ORG.id, userId: USER.id, orgUserId: ORG_USER.id, role, authOrgId: ORG.id },
    requestId: 'req_test',
  };
}

const MODERN_META = {
  'io.modelcontextprotocol/protocolVersion': '2026-07-28',
  'io.modelcontextprotocol/clientCapabilities': {},
};

async function rpc(
  ctx: ToolContext,
  tools: readonly Tool[],
  method: string,
  params: Record<string, unknown>,
  name?: string,
) {
  const handler = createMcpHandler(() => createToolServer(ctx, tools));
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'mcp-protocol-version': '2026-07-28',
    'mcp-method': method,
  };
  if (name) {
    headers['mcp-name'] = name;
  }
  const response = await handler.fetch(
    new Request('http://localhost:8100/mcp', {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: { ...params, _meta: MODERN_META } }),
    }),
  );
  const body = (await response.json()) as { result?: Record<string, unknown>; error?: { message: string } };
  if (body.error) {
    throw new Error(body.error.message);
  }
  return body.result as Record<string, unknown>;
}

export async function listTools(ctx: ToolContext, tools: readonly Tool[] = TOOLS) {
  const result = await rpc(ctx, tools, 'tools/list', {});
  return result.tools as Array<{
    name: string;
    annotations?: Record<string, unknown>;
    inputSchema: { type?: string; properties?: Record<string, unknown> };
  }>;
}

export async function callTool(name: string, args: unknown, ctx: ToolContext, tools: readonly Tool[] = TOOLS) {
  return (await rpc(ctx, tools, 'tools/call', { name, arguments: args }, name)) as {
    isError?: boolean;
    structuredContent?: Record<string, unknown>;
    content: Array<{ type: string; text?: string }>;
  };
}

export type ToolSpec = [name: string, scope: AccessScope, kind: ToolKind, idempotent: boolean, openWorld: boolean];

export function toolSpecs(tools: readonly Tool[]): ToolSpec[] {
  return tools.map((tool) => [tool.name, tool.scope, tool.kind, tool.idempotent, tool.openWorld]);
}

export type ToolCase = {
  tool: string;
  args: Record<string, unknown>;
  service: string;
  expected: unknown[];
  returns?: unknown;
};

function serviceFake(path: string, returns: unknown, calls: unknown[][]): Record<string, unknown> {
  const keys = path.split('.');
  const method = keys.pop() ?? '';
  let node: Record<string, unknown> = {
    [method]: async (...args: unknown[]) => {
      calls.push(args);
      return returns;
    },
  };
  for (const key of keys.reverse()) {
    node = { [key]: node };
  }
  return node;
}

export async function runCase(tools: readonly Tool[], c: ToolCase): Promise<void> {
  const calls: unknown[][] = [];
  const returns = 'returns' in c ? c.returns : { id: 'result' };
  const ctx = toolContext(fakeContainer(serviceFake(c.service, returns, calls)));
  const result = await callTool(c.tool, c.args, ctx, tools);
  expect(result.isError ?? false).toBe(false);
  expect(calls).toEqual([c.expected]);
  expect(result.structuredContent).toEqual(toToolResult(returns).structuredContent);
}
