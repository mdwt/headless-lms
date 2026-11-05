import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance, type RouteOptions } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import type { Container } from '../app/container.js';
import { mcpEndpoints } from '../app/mcp-endpoints.js';
import { registerRoutes } from './routes.js';
import { registerAuth } from './plugins/auth.js';
import { TOOLS } from './mcp/tools/index.js';
import { OPERATION_REGISTRY, declarationOf } from './operations.js';

const anything: unknown = new Proxy(() => anything, { get: () => anything });

let app: FastifyInstance;
const routes: RouteOptions[] = [];

beforeAll(async () => {
  app = Fastify();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.addHook('onRoute', (route) => {
    routes.push(route);
  });
  registerAuth(
    app,
    new Proxy(
      {
        mcp: mcpEndpoints({
          authBaseURL: 'https://lms.example.com',
          adminAppUrl: 'https://admin.example.com',
        }),
      },
      { get: (target, key) => (key === 'mcp' ? target.mcp : anything) },
    ) as unknown as Container,
  );
  registerRoutes(app, anything as Container);
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

const apiRoutes = () =>
  routes.filter(
    (route) =>
      route.url.startsWith('/api/') &&
      !route.url.startsWith('/api/auth') &&
      route.method !== 'HEAD' &&
      !(route.schema as { hide?: boolean } | undefined)?.hide,
  );

describe('operations', () => {
  it('names a declared core operation on every API route', () => {
    const missing = apiRoutes()
      .filter((route) => {
        const operation = (route.config as { operation?: string } | undefined)?.operation;
        return !operation || declarationOf(operation) === null;
      })
      .map((route) => `${String(route.method)} ${route.url}`);
    expect(missing).toEqual([]);
  });

  it('names a declared core operation on every MCP tool', () => {
    expect(
      TOOLS.filter((tool) => declarationOf(tool.operation) === null).map((t) => t.name),
    ).toEqual([]);
  });

  it('declares every operation with a known kind', () => {
    for (const [namespace, declarations] of Object.entries(OPERATION_REGISTRY)) {
      for (const [method, declaration] of Object.entries(declarations)) {
        const ok =
          ['member', 'system', 'public', 'owner'].includes(declaration as string) ||
          (typeof declaration === 'object' && declaration.permissions.length > 0);
        expect(ok, `${namespace}.${method}`).toBe(true);
      }
    }
  });

  it('never routes a person to a system operation', () => {
    const system = apiRoutes()
      .map((route) => (route.config as { operation?: string } | undefined)?.operation)
      .filter((operation): operation is string => declarationOf(operation ?? '') === 'system');
    expect(system).toEqual([]);
  });
});
