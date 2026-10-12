import { describe, expect, it } from 'vitest';
import { mcpEndpoints } from './mcp-endpoints.js';

describe('mcpEndpoints', () => {
  it('derives every MCP url from the api and admin origins', () => {
    expect(
      mcpEndpoints({ authBaseURL: 'https://api.example.com/', adminAppUrl: 'https://admin.example.com' }),
    ).toEqual({
      oauthEnabled: true,
      resource: 'https://api.example.com/mcp',
      resourceMetadataUrl: 'https://api.example.com/.well-known/oauth-protected-resource/mcp',
      issuer: 'https://api.example.com/api/auth',
      loginPage: 'https://admin.example.com/login',
      consentPage: 'https://admin.example.com/oauth/consent',
      orgPickerPage: 'https://admin.example.com/onboarding/select-organization',
    });
  });

  it('enables oauth for https and loopback api urls only', () => {
    const enabled = (authBaseURL: string) =>
      mcpEndpoints({ authBaseURL, adminAppUrl: 'https://admin.example.com' }).oauthEnabled;
    expect(enabled('https://api.example.com')).toBe(true);
    expect(enabled('https://10.0.0.5:8443')).toBe(true);
    expect(enabled('http://localhost:8100')).toBe(true);
    expect(enabled('http://127.0.0.1:8100')).toBe(true);
    expect(enabled('http://127.4.5.6')).toBe(true);
    expect(enabled('http://[::1]:8100')).toBe(true);
    expect(enabled('http://api.example.com')).toBe(false);
    expect(enabled('http://api:8000')).toBe(false);
    expect(enabled('http://10.0.0.5:8000')).toBe(false);
    expect(enabled('http://localhost.example.com')).toBe(false);
    expect(enabled('http://128.0.0.1')).toBe(false);
  });
});
