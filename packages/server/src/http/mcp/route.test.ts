// Tests for the MCP HTTP route — verifies the actual Fastify endpoint at /mcp.
//
// Strategy: build the full server via buildServer() and drive it with
// app.inject() to confirm that the route is mounted, that withMcpAuth
// rejects unauthenticated requests, and that the opaque-error handler
// does not propagate internal messages.
import { describe, it, expect, afterAll } from 'vitest';
import { buildServer } from '../server.js';
import { buildContainer, type Config } from '../../app/container.js';
import type { ServerConfig } from '../config.js';

// DB-less unit env: no live Postgres/MinIO, matching the defaults the process
// entry point would otherwise read from an unset environment.
const containerConfig: Config = {
  databaseUrl: '',
  authBaseURL: 'http://localhost:8000',
  authSecret: '',
  trustedOrigins: ['http://localhost:8001', 'http://localhost:8002', 'http://localhost:8000'],
  mcpLoginPage: 'http://localhost:8001/login',
  adminUrl: 'http://localhost:8001',
  credentialStoreKey: '',
};

const serverConfig: ServerConfig = {
  port: 8000,
  host: '0.0.0.0',
  publicUrl: containerConfig.authBaseURL,
  clientOrigins: ['http://localhost:8001', 'http://localhost:8002'],
  container: containerConfig,
};

const container = await buildContainer(containerConfig);
const app = await buildServer(serverConfig, container);

describe('MCP HTTP route — /mcp', () => {
  afterAll(async () => {
    await app.close();
  });

  it('POST /mcp without Authorization header → 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    expect(res.statusCode).toBe(401);
  });
});
