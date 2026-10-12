import type { FastifyInstance } from 'fastify';
import { ACCESS_SCOPES } from '@headless-lms/core/organizations';
import type { Container } from '../app/container.js';
import { bridgeWebResponse, toWebRequest } from './web-bridge.js';

export function registerWellKnown(app: FastifyInstance, container: Container): void {
  const origin = new URL(container.mcp.issuer).origin;
  const resourceMetadata = () => ({
    resource: container.mcp.resource,
    authorization_servers: [container.mcp.issuer],
    scopes_supported: [...ACCESS_SCOPES],
    bearer_methods_supported: ['header'],
  });
  const hidden = { schema: { hide: true } };

  app.get('/.well-known/oauth-protected-resource/mcp', hidden, async () => resourceMetadata());
  app.get('/.well-known/oauth-protected-resource', hidden, async () => resourceMetadata());
  app.get('/.well-known/oauth-authorization-server/api/auth', hidden, async (request, reply) => {
    await bridgeWebResponse(
      await container.auth.authorizationServerMetadata(toWebRequest(request, origin)),
      reply,
    );
  });
}
