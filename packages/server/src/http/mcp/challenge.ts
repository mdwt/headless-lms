import { ACCESS_SCOPES } from '@headless-lms/core/organizations';
import type { McpEndpoints } from '../../app/mcp-endpoints.js';

export function unauthorized(mcp: McpEndpoints): Response {
  const body = { jsonrpc: '2.0', error: { code: -32000, message: 'Unauthorized' }, id: null };
  return new Response(JSON.stringify(body), {
    status: 401,
    headers: {
      'content-type': 'application/json',
      'www-authenticate': `Bearer resource_metadata="${mcp.resourceMetadataUrl}", scope="${ACCESS_SCOPES.join(' ')}"`,
    },
  });
}

export function forbidden(): Response {
  const body = {
    jsonrpc: '2.0',
    error: { code: -32000, message: 'Only staff of this organization can use this server' },
    id: null,
  };
  return new Response(JSON.stringify(body), {
    status: 403,
    headers: { 'content-type': 'application/json' },
  });
}
