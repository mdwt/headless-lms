// Inbound: Fastify HTTP server. Imports the container, mounts auth + routes, starts.
import Fastify, { type FastifyRequest, type FastifyReply } from "fastify";
import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import {
  serializerCompiler,
  validatorCompiler,
  jsonSchemaTransform,
} from "fastify-type-provider-zod";
import { fromNodeHeaders } from "better-auth/node";
import { oAuthDiscoveryMetadata, oAuthProtectedResourceMetadata } from "better-auth/plugins";
import { buildContainer } from "../composition/container.js";
import { coursesRoutes } from "./routes/courses.js";
import { modulesRoutes } from "./routes/modules.js";
import { studentsRoutes } from "./routes/students.js";
import { entitlementsRoutes } from "./routes/entitlements.js";
import { organizationsRoutes } from "./routes/organizations.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { assetsRoutes } from "./routes/assets.js";
import { mcpRoutes } from "./mcp/route.js";
import { connectedAppsRoutes } from "./routes/connected-apps.js";

function loadConfig() {
  // CLIENT_ORIGIN is a comma-separated list of browser app origins (web app +
  // admin dashboard). Each is allowed for CORS and registered as a trusted
  // origin so better-auth accepts its requests and sets cookies for it.
  const clientOrigins = (process.env.CLIENT_ORIGIN ?? "http://localhost:8001,http://localhost:8002")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  const apiOrigin = process.env.BETTER_AUTH_URL ?? "http://localhost:8000";
  // Include the API's own origin so MCP OAuth flows originating from the same
  // server (e.g. server-side token requests) are accepted by better-auth.
  const trustedOrigins = [...new Set([...clientOrigins, apiOrigin])];
  return {
    port: Number(process.env.PORT ?? 8000),
    publicUrl: apiOrigin,
    clientOrigins,
    container: {
      databaseUrl: process.env.DATABASE_URL ?? "",
      authBaseURL: apiOrigin,
      authSecret: process.env.BETTER_AUTH_SECRET ?? "",
      trustedOrigins,
      mcpLoginPage: process.env.MCP_LOGIN_PAGE ?? "http://localhost:8001/login",
      storage: {
        endPoint: process.env.STORAGE_ENDPOINT ?? "localhost",
        port: Number(process.env.STORAGE_PORT ?? 8006),
        useSSL: (process.env.STORAGE_USE_SSL ?? "false") === "true",
        accessKey: process.env.STORAGE_ACCESS_KEY ?? "minioadmin",
        secretKey: process.env.STORAGE_SECRET_KEY ?? "minioadmin",
        region: process.env.STORAGE_REGION ?? "us-east-1",
        bucket: process.env.STORAGE_BUCKET ?? "headless-lms",
        uploadExpirySeconds: Number(process.env.STORAGE_UPLOAD_EXPIRY ?? 300),
        downloadExpirySeconds: Number(process.env.STORAGE_DOWNLOAD_EXPIRY ?? 300),
      },
    },
  };
}

/** Bridges a Web API Response back to a Fastify reply. */
async function bridgeWebResponse(response: Response, reply: FastifyReply) {
  reply.status(response.status);
  // Emit each Set-Cookie value individually — forEach() collapses multiple
  // Set-Cookie headers into one comma-joined string (undici behaviour), which
  // corrupts multi-cookie auth responses. getSetCookie() returns them as an
  // array so each one is forwarded as a separate header.
  const cookies = response.headers.getSetCookie();
  if (cookies.length > 0) {
    reply.raw.setHeader("set-cookie", cookies);
  }
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") return; // already handled above
    reply.header(key, value);
  });
  reply.send(response.body ? await response.text() : null);
}

export function buildServer() {
  const config = loadConfig();
  const app = Fastify({ logger: true });
  const container = buildContainer(config.container);
  const { auth } = container;

  // Validate + serialize request/response bodies from the shared Zod contract.
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // OAuth 2.1 / MCP clients POST form-encoded bodies to the token endpoint.
  // Fastify has no built-in parser for this content-type and would 415 before
  // the handler runs. Register a raw passthrough so the string body reaches
  // the bridge, which forwards it verbatim with the original Content-Type.
  app.addContentTypeParser(
    "application/x-www-form-urlencoded",
    { parseAs: "string" },
    (_req, body, done) => done(null, body),
  );

  // CORS must allow credentials so the SPA/admin can carry the session cookie.
  app.register(cors, {
    origin: config.clientOrigins,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
    maxAge: 86400,
  });

  // OpenAPI: @fastify/swagger reads the Zod route schemas (via the transform)
  // to build the spec the frontend SDK is generated from. Registered before the
  // routes so its onRoute hook captures them. UI + JSON served under /docs.
  app.register(swagger, {
    openapi: {
      info: { title: "Headless LMS API", version: "0.0.0" },
      servers: [{ url: config.publicUrl }],
    },
    transform: jsonSchemaTransform,
  });
  app.register(swaggerUi, { routePrefix: "/docs" });

  // Mount better-auth: a catch-all that bridges Fastify <-> Web Request/Response.
  app.route({
    method: ["GET", "POST"],
    url: "/api/auth/*",
    async handler(request, reply) {
      const url = new URL(request.url, `http://${request.headers.host}`);
      const req = new Request(url.toString(), {
        method: request.method,
        headers: fromNodeHeaders(request.headers),
        body:
          typeof request.body === "string"
            ? request.body
            : request.body
              ? JSON.stringify(request.body)
              : undefined,
      });
      await bridgeWebResponse(await auth.handler(req), reply);
    },
  });

  // OAuth 2.0 discovery endpoints required by MCP clients (RFC 8414).
  // These must live at the root — outside any /api prefix — so MCP clients
  // can discover the authorization server via standard well-known paths.
  const discoveryHandler = oAuthDiscoveryMetadata(auth);
  app.get("/.well-known/oauth-authorization-server", async (request, reply) => {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const req = new Request(url.toString(), {
      method: "GET",
      headers: fromNodeHeaders(request.headers),
    });
    await bridgeWebResponse(await discoveryHandler(req), reply);
  });

  const protectedResourceHandler = oAuthProtectedResourceMetadata(auth);
  app.get("/.well-known/oauth-protected-resource", async (request, reply) => {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const req = new Request(url.toString(), {
      method: "GET",
      headers: fromNodeHeaders(request.headers),
    });
    await bridgeWebResponse(await protectedResourceHandler(req), reply);
  });

  // preHandler that resolves the current session; 401 when absent.
  app.decorate("requireSession", async (request: FastifyRequest, reply: FastifyReply) => {
    const sessionData = await auth.api.getSession({
      headers: fromNodeHeaders(request.headers),
    });
    if (!sessionData) {
      reply.status(401).send({ error: "unauthorized" });
      return;
    }
    request.authUser = sessionData.user;
    request.orgId =
      (sessionData.session as { activeOrganizationId?: string | null }).activeOrganizationId ?? null;
  });

  app.get("/health", async () => ({ status: "ok" }));

  // Domain routes (validated against the shared contract).
  app.register(async (instance) => {
    await coursesRoutes(instance, container);
    await modulesRoutes(instance, container);
    await studentsRoutes(instance, container);
    await entitlementsRoutes(instance, container);
    await organizationsRoutes(instance, container);
    await dashboardRoutes(instance, container);
    await assetsRoutes(instance, container);
    await connectedAppsRoutes(instance, container);
    await mcpRoutes(instance, container);
  });

  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const app = buildServer();
  const port = Number(process.env.PORT ?? 8000);
  app.listen({ port, host: "0.0.0.0" }).catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
}
