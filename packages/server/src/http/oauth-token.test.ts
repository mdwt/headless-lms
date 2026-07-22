import { describe, it, expect, afterAll } from 'vitest';
import { buildServer } from './server.js';
import { buildContainer, type Config } from '../app/container.js';
import type { ServerConfig } from './config.js';

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

describe('OAuth token endpoint — form-encoded body', () => {
  afterAll(async () => {
    await app.close();
  });

  it('POST /api/auth/mcp/token with a form body reaches the handler (not 415/404)', async () => {
    // Regression for Critical 1: Fastify must not reject form-encoded bodies
    // before they reach Better Auth. The mcp plugin mounts the token endpoint at
    // /mcp/token (NOT /oauth2/token). With an invalid code/client the request
    // must fail with an OAuth error (400/401) — a 415 means the form parser is
    // missing; a 404 means we hit the wrong path and never exercised the bridge.
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/mcp/token',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'grant_type=authorization_code&code=invalid&client_id=nope',
    });

    // The regression target is the Fastify→Better-Auth bridge, not a full token
    // exchange (which needs a live DB + registered client — that's a Slice C
    // integration test). Proving the bridge works:
    //   - NOT 415  → the form-urlencoded parser accepted the body
    //   - NOT 404  → it routed to the real /mcp/token handler
    // In this DB-less unit env the handler then 500s on its client lookup
    // (SASL: no DATABASE_URL), which still proves the request reached it.
    expect(res.statusCode).not.toBe(415);
    expect(res.statusCode).not.toBe(404);
  });
});
