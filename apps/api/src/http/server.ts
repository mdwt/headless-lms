// Inbound: Fastify HTTP server. Imports the container, mounts auth + routes, starts.
import Fastify, { type FastifyRequest, type FastifyReply } from "fastify";
import cors from "@fastify/cors";
import { fromNodeHeaders } from "better-auth/node";
import { buildContainer } from "../composition/container.js";

function loadConfig() {
  const clientOrigin = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";
  return {
    port: Number(process.env.PORT ?? 3000),
    clientOrigin,
    container: {
      databaseUrl: process.env.DATABASE_URL ?? "",
      authBaseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
      authSecret: process.env.BETTER_AUTH_SECRET ?? "",
      trustedOrigins: [clientOrigin],
    },
  };
}

export function buildServer() {
  const config = loadConfig();
  const app = Fastify({ logger: true });
  const container = buildContainer(config.container);
  const { auth } = container;

  // CORS must allow credentials so the SPA can carry the session cookie.
  app.register(cors, {
    origin: config.clientOrigin,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
    maxAge: 86400,
  });

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
  });

  app.get("/health", async () => ({ status: "ok" }));

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
