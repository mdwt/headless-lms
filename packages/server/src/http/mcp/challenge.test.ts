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
      'Bearer resource_metadata="http://localhost:8100/.well-known/oauth-protected-resource/mcp", scope="courses:read courses:write courses:delete downloads:read downloads:write downloads:delete bundles:read bundles:write bundles:delete media:read students:read students:write students:invite access:read access:write analytics:read automations:read automations:write automations:delete comments:read comments:moderate communities:read communities:write communities:delete community_members:read community_members:write community_moderation:read community_moderation:write"',
    );
  });
});
