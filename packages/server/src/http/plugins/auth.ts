// Everything better-auth touches on the HTTP surface:
//   - the /api/auth/* catch-all bridged to better-auth's Web handler
//   - the `requireSession` / `requireOrgSession` decorators routes guard with
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Container } from '../../app/container.js';
import { isPermission } from '@headless-lms/core/organizations';
import type { CallerLimit } from '@headless-lms/core/organizations';
import { ForbiddenError } from '@headless-lms/core/shared/errors';
import type { CredentialLimit } from '@headless-lms/core/types';
import { requestApp } from '../request-domain.js';
import { bridgeWebResponse, toWebRequest } from '../web-bridge.js';

/** The request carries no session. The central error handler maps this to 401. */
export class UnauthorizedError extends Error {
  constructor(message = 'Sign in to continue') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

function carriesKey(request: FastifyRequest): boolean {
  return request.headers['x-api-key'] !== undefined || request.headers.authorization !== undefined;
}

const ANOTHER_ORGANIZATION = 'This session is for another organization';

function callerLimit(limit: CredentialLimit): CallerLimit {
  return 'roleKey' in limit ? limit : { scopes: limit.scopes.filter(isPermission) };
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
      await refuseSessionUse(request);
      await bridgeWebResponse(await auth.handler(toWebRequest(request, origin)), reply);
    },
  });

  async function refuseSessionUse(request: FastifyRequest): Promise<void> {
    const use = auth.sessionUse(request.method, request.url, request.body);
    const at = use ? await requestApp(appServer, request) : null;
    if (!use || !at) {
      return;
    }
    if (use.kind === 'switch') {
      if (!appServer.organizations.acceptsSwitch(at, use.to)) {
        throw new ForbiddenError(`On this domain a session is for ${at.organization.name} only`);
      }
      return;
    }
    const session = await auth.verify(request.headers);
    const authOrgId = session?.session.activeOrganizationId;
    if (authOrgId && !appServer.organizations.acceptsSession(at, authOrgId)) {
      throw new UnauthorizedError(ANOTHER_ORGANIZATION);
    }
  }

  async function refuseAnotherOrganization(
    request: FastifyRequest,
    authOrgId: string,
  ): Promise<void> {
    const at = await requestApp(appServer, request);
    if (at && !appServer.organizations.acceptsSession(at, authOrgId)) {
      throw new UnauthorizedError(ANOTHER_ORGANIZATION);
    }
  }

  async function requireKey(request: FastifyRequest): Promise<void> {
    const grant = await appServer.auth.verifyApiKey(request.headers);
    if (!grant) {
      throw new UnauthorizedError('The API key is not valid');
    }
    const caller = await appServer.organizations.resolveCaller(
      grant.orgId,
      grant.userId,
      callerLimit(grant.limit),
    );
    if (!caller) {
      throw new UnauthorizedError("The API key's organization no longer exists");
    }
    request.authUserId = grant.userId;
    request.userId = caller.userId ?? grant.userId;
    request.orgId = caller.orgId;
    request.authOrgId = grant.orgId;
    request.resolvedCaller = caller;
    appServer.requestContext.set({ orgId: caller.orgId });
  }

  // Session only, no active org required. For the routes a caller reaches
  // *before* they have an org: creating their first organization, and accepting
  // an invitation (which is what stamps the active org onto the session).
  app.decorate('requireSession', async (request: FastifyRequest) => {
    if (carriesKey(request)) {
      throw new UnauthorizedError('Sign in to continue; an API key is not accepted here');
    }
    const session = await appServer.auth.verify(request.headers);
    if (!session) {
      throw new UnauthorizedError();
    }
    request.authUser = session.user;
    request.authUserId = session.user.id;
    request.userId = session.user.id;

    const authOrgId = session.session.activeOrganizationId;
    if (authOrgId) {
      await refuseAnotherOrganization(request, authOrgId);
      request.authOrgId = authOrgId;
      const caller = await appServer.organizations.resolveCaller(authOrgId, session.user.id);
      if (caller) {
        request.resolvedCaller = caller;
        request.orgId = caller.orgId;
        appServer.requestContext.set({ orgId: caller.orgId });
      }
    }
  });

  // Requires a valid API key, or a valid session with an active org set — every org-scoped route.
  app.decorate('requireOrgSession', async (request: FastifyRequest) => {
    if (request.resolvedCaller && request.orgId) {
      return;
    }
    if (carriesKey(request)) {
      await requireKey(request);
      return;
    }
    const session = await appServer.auth.verify(request.headers);
    if (!session) {
      throw new UnauthorizedError();
    }
    const authOrgId = session.session.activeOrganizationId;
    if (!authOrgId) {
      throw new UnauthorizedError('Choose an organization to continue');
    }
    await refuseAnotherOrganization(request, authOrgId);

    const caller = await appServer.organizations.resolveCaller(authOrgId, session.user.id);
    if (!caller) {
      throw new UnauthorizedError('Your session points to an organization that no longer exists');
    }
    if (!caller.orgUserId) {
      throw new UnauthorizedError('You are not a member of this organization');
    }
    request.authUser = session.user;
    request.authUserId = session.user.id;
    request.userId = session.user.id;
    request.orgId = caller.orgId;
    request.resolvedCaller = caller;
    appServer.requestContext.set({ orgId: caller.orgId });
    // resolveScope requires the auth-provider id too — routes that write back
    // through better-auth key on it.
    request.authOrgId = authOrgId;
  });
}
