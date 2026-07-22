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

describe('OAuth discovery endpoints', () => {
  afterAll(async () => {
    await app.close();
  });

  it('GET /.well-known/oauth-authorization-server → 200 with issuer', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/.well-known/oauth-authorization-server',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as Record<string, unknown>;
    // RFC 8414 requires either issuer or authorization_endpoint
    expect(typeof body.issuer === 'string' || typeof body.authorization_endpoint === 'string').toBe(
      true,
    );
  });

  it('GET /.well-known/oauth-protected-resource → 200 with resource', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/.well-known/oauth-protected-resource',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as Record<string, unknown>;
    expect(typeof body.resource === 'string' || Array.isArray(body.authorization_servers)).toBe(
      true,
    );
  });
});
