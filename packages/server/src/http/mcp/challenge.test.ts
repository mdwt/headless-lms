import { ALL_PERMISSIONS } from '@headless-lms/core/organizations';
import { describe, expect, it } from 'vitest';
import { mcpEndpoints } from '../../app/mcp-endpoints.js';
import { unauthorized } from './challenge.js';

const mcp = mcpEndpoints({
  authBaseURL: 'http://localhost:8100',
  adminAppUrl: 'http://localhost:8101',
});

describe('unauthorized', () => {
  it('answers 401 with a JSON-RPC error that points at the protected resource metadata', async () => {
    const res = unauthorized(mcp);
    expect(res.status).toBe(401);
    expect(res.headers.get('content-type')).toBe('application/json');
    expect(await res.json()).toEqual({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Unauthorized' },
      id: null,
    });
    expect(res.headers.get('www-authenticate')).toBe(
      `Bearer resource_metadata="http://localhost:8100/.well-known/oauth-protected-resource/mcp", scope="${ALL_PERMISSIONS.join(' ')}"`,
    );
  });
});
