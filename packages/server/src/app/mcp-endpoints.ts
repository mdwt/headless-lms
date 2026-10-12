import type { McpAuthOptions } from '@headless-lms/adapter-auth';

export interface McpEndpoints extends McpAuthOptions {
  issuer: string;
  resourceMetadataUrl: string;
}

const trimSlash = (url: string) => url.replace(/\/+$/, '');

const LOOPBACK_IPV4 = /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;

function oauthEligible(resource: string): boolean {
  const { protocol, hostname } = new URL(resource);
  if (protocol === 'https:') {
    return true;
  }
  return (
    protocol === 'http:' &&
    (hostname === 'localhost' || hostname === '[::1]' || LOOPBACK_IPV4.test(hostname))
  );
}

export function mcpEndpoints(config: { authBaseURL: string; adminAppUrl: string }): McpEndpoints {
  const api = trimSlash(config.authBaseURL);
  const admin = trimSlash(config.adminAppUrl);
  return {
    oauthEnabled: oauthEligible(`${api}/mcp`),
    resource: `${api}/mcp`,
    resourceMetadataUrl: `${api}/.well-known/oauth-protected-resource/mcp`,
    issuer: `${api}/api/auth`,
    loginPage: `${admin}/login`,
    consentPage: `${admin}/oauth/consent`,
    orgPickerPage: `${admin}/onboarding/select-organization`,
  };
}
