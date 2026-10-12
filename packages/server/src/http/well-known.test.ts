import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { ACCESS_SCOPES } from '@headless-lms/core/organizations';
import type { Container } from '../app/container.js';
import { mcpEndpoints } from '../app/mcp-endpoints.js';
import { registerWellKnown } from './well-known.js';

const mcp = mcpEndpoints({
  authBaseURL: 'http://localhost:8100',
  adminAppUrl: 'http://localhost:8101',
});
const seenUrls: string[] = [];
const container = {
  mcp,
  auth: {
    authorizationServerMetadata: async (request: Request) => {
      seenUrls.push(request.url);
      return new Response(JSON.stringify({ issuer: mcp.issuer }), {
        headers: { 'content-type': 'application/json' },
      });
    },
  },
} as unknown as Container;

let app: FastifyInstance;
beforeAll(async () => {
  app = Fastify();
  registerWellKnown(app, container);
  await app.ready();
});
afterAll(async () => app.close());

describe('well-known metadata', () => {
  it('serves protected resource metadata for /mcp', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/.well-known/oauth-protected-resource/mcp',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      resource: 'http://localhost:8100/mcp',
      authorization_servers: ['http://localhost:8100/api/auth'],
      scopes_supported: [...ACCESS_SCOPES],
      bearer_methods_supported: ['header'],
    });
  });
  it('serves the same document at the root path', async () => {
    const res = await app.inject({ method: 'GET', url: '/.well-known/oauth-protected-resource' });
    expect(res.json().resource).toBe('http://localhost:8100/mcp');
  });
  it('serves authorization server metadata at the RFC 8414 path-inserted url', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/.well-known/oauth-authorization-server/api/auth',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ issuer: 'http://localhost:8100/api/auth' });
  });
  it('hands the auth server a request on the public api origin', async () => {
    seenUrls.length = 0;
    await app.inject({
      method: 'GET',
      url: '/.well-known/oauth-authorization-server/api/auth',
      headers: { host: 'api:8000' },
    });
    expect(seenUrls).toEqual([
      'http://localhost:8100/.well-known/oauth-authorization-server/api/auth',
    ]);
  });
});
