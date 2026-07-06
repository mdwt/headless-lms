// Everything better-auth touches on the HTTP surface:
//   - the /api/auth/* catch-all bridged to better-auth's Web handler
//   - the RFC 8414 OAuth discovery endpoints MCP clients need at the root
//   - the `requireSession` decorator that back-office routes guard with
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { fromNodeHeaders } from "better-auth/node";
import { oAuthDiscoveryMetadata, oAuthProtectedResourceMetadata } from "better-auth/plugins";
import type { Container } from "../../composition/container.js";
import { bridgeWebResponse, toWebRequest } from "../web-bridge.js";

export function registerAuth(app: FastifyInstance, container: Container): void {
  const { auth } = container;

  // OAuth 2.1 / MCP clients POST form-encoded bodies to the token endpoint.
  // Fastify has no built-in parser for this content-type and would 415 before
  // the handler runs. Register a raw passthrough so the string body reaches the
  // bridge, which forwards it verbatim with the original Content-Type.
  app.addContentTypeParser(
    "application/x-www-form-urlencoded",
    { parseAs: "string" },
    (_req, body, done) => done(null, body),
  );

  // Mount better-auth: a catch-all that bridges Fastify <-> Web Request/Response.
  app.route({
    method: ["GET", "POST"],
    url: "/api/auth/*",
    async handler(request, reply) {
      await bridgeWebResponse(await auth.handler(toWebRequest(request)), reply);
    },
  });

  // OAuth 2.0 discovery endpoints required by MCP clients (RFC 8414). These must
  // live at the root — outside any /api prefix — so MCP clients can discover the
  // authorization server via standard well-known paths.
  const discovery = oAuthDiscoveryMetadata(auth);
  app.get("/.well-known/oauth-authorization-server", async (request, reply) => {
    await bridgeWebResponse(await discovery(toWebRequest(request)), reply);
  });

  const protectedResource = oAuthProtectedResourceMetadata(auth);
  app.get("/.well-known/oauth-protected-resource", async (request, reply) => {
    await bridgeWebResponse(await protectedResource(toWebRequest(request)), reply);
  });

  // Resolves the current session; 401 when absent. Idempotent — if the session
  // is already resolved on this request (e.g. the scoped onRequest hook ran, and
  // a route also lists it as a preHandler) it returns without a second lookup.
  app.decorate("requireSession", async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.authUser) return;
    const sessionData = await auth.api.getSession({
      headers: fromNodeHeaders(request.headers),
    });
    if (!sessionData) {
      reply.status(401).send({ error: "unauthorized" });
      return;
    }
    request.authUser = sessionData.user;
    request.orgId =
      (sessionData.session as { activeOrganizationId?: string | null }).activeOrganizationId ??
      null;
  });
}
