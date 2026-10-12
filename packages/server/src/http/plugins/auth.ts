// Everything better-auth touches on the HTTP surface:
//   - the /api/auth/* catch-all bridged to better-auth's Web handler
//   - the `requireSession` / `requireOrgSession` decorators routes guard with
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Container } from '../../app/container.js';
import { bridgeWebResponse, toWebRequest } from '../web-bridge.js';

/** The request carries no session. The central error handler maps this to 401. */
export class UnauthorizedError extends Error {
  constructor(message = 'no session on the request') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export function registerAuth(app: FastifyInstance, appServer: Container): void {
  const { auth } = appServer;
  const origin = new URL(appServer.mcp.issuer).origin;

  app.addContentTypeParser(
    'application/x-www-form-urlencoded',
    { parseAs: 'string' },
    (_request, body, done) => {
      done(null, body);
    },
  );

  // Mount better-auth: a catch-all that bridges Fastify <-> Web Request/Response.
  app.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    async handler(request, reply) {
      await bridgeWebResponse(await auth.handler(toWebRequest(request, origin)), reply);
    },
  });

  // Session only, no active org required. For the routes a caller reaches
  // *before* they have an org: creating their first organization, and accepting
  // an invitation (which is what stamps the active org onto the session).
  app.decorate('requireSession', async (request: FastifyRequest) => {
    const session = await appServer.auth.verify(request.headers);
    if (!session) {
      throw new UnauthorizedError();
    }
    request.authUser = session.user;
    request.userId = session.user.id;

    const authOrgId = session.session.activeOrganizationId;
    if (authOrgId) {
      request.authOrgId = authOrgId;
      const org = await appServer.organizations.getByExternalId(authOrgId);
      if (org) {
        request.orgId = org.id;
      }
    }
  });

  // Requires a valid session with an active org set — every org-scoped route.
  app.decorate('requireOrgSession', async (request: FastifyRequest) => {
    const session = await appServer.auth.verify(request.headers);
    if (!session) {
      throw new UnauthorizedError();
    }
    const authOrgId = session.session.activeOrganizationId;
    if (!authOrgId) {
      throw new UnauthorizedError();
    }

    const org = await appServer.organizations.getByExternalId(authOrgId);
    if (!org) {
      throw new UnauthorizedError('session organization not found');
    }
    request.authUser = session.user;
    request.userId = session.user.id;
    request.orgId = org.id;
    // resolveScope requires the auth-provider id too — routes that write back
    // through better-auth key on it.
    request.authOrgId = authOrgId;
  });
}
