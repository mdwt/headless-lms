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
import { buildContainer } from "../composition/container.js";
import { coursesRoutes } from "./routes/courses.js";
import { modulesRoutes } from "./routes/modules.js";
import { studentsRoutes } from "./routes/students.js";
import { enrollmentsRoutes } from "./routes/enrollments.js";
import { submissionsRoutes } from "./routes/submissions.js";
import { teamRoutes } from "./routes/team.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { assetsRoutes } from "./routes/assets.js";

function loadConfig() {
  // CLIENT_ORIGIN is a comma-separated list of browser app origins (web app +
  // admin dashboard). Each is allowed for CORS and registered as a trusted
  // origin so better-auth accepts its requests and sets cookies for it.
  const clientOrigins = (process.env.CLIENT_ORIGIN ?? "http://localhost:5173")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  return {
    port: Number(process.env.PORT ?? 3000),
    publicUrl: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
    clientOrigins,
    container: {
      databaseUrl: process.env.DATABASE_URL ?? "",
      authBaseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
      authSecret: process.env.BETTER_AUTH_SECRET ?? "",
      trustedOrigins: clientOrigins,
      mcpLoginPage: process.env.MCP_LOGIN_PAGE ?? "http://localhost:3001/login",
      storage: {
        endPoint: process.env.STORAGE_ENDPOINT ?? "localhost",
        port: Number(process.env.STORAGE_PORT ?? 9000),
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

export function buildServer() {
  const config = loadConfig();
  const app = Fastify({ logger: true });
  const container = buildContainer(config.container);
  const { auth } = container;

  // Validate + serialize request/response bodies from the shared Zod contract.
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

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
        body: request.body ? JSON.stringify(request.body) : undefined,
      });
      const response = await auth.handler(req);
      reply.status(response.status);
      response.headers.forEach((value, key) => reply.header(key, value));
      reply.send(response.body ? await response.text() : null);
    },
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
    await enrollmentsRoutes(instance, container);
    await submissionsRoutes(instance, container);
    await teamRoutes(instance, container);
    await dashboardRoutes(instance, container);
    await assetsRoutes(instance, container);
  });

  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const app = buildServer();
  const port = Number(process.env.PORT ?? 3000);
  app.listen({ port, host: "0.0.0.0" }).catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
}
