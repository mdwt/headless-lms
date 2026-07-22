// Inbound HTTP server. `buildServer` wires the Fastify instance from focused
// plugins — each concern lives in its own module (config, CORS, OpenAPI, auth,
// error handling, routes) so this file stays a readable table of contents.
import Fastify, { type FastifyInstance } from "fastify";
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";
import type { Container } from "../composition/container.js";
import type { ServerConfig } from "./config.js";
import { registerCors } from "./plugins/cors.js";
import { registerOpenApi } from "./plugins/openapi.js";
import { registerAuth } from "./plugins/auth.js";
import { registerErrorHandler } from "./plugins/error-handler.js";
import { registerRoutes } from "./routes.js";

export async function buildServer(
  config: ServerConfig,
  container: Container,
): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });

  // Validate + serialize request/response bodies from the shared Zod contract.
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  registerCors(app, config);
  registerOpenApi(app, config);
  registerAuth(app, container);
  registerErrorHandler(app);
  registerRoutes(app, container);

  // Drain + stop the outbox relay on shutdown. Harmless when the relay was
  // never started (gen-openapi boots this app with ready() + close() only).
  app.addHook("onClose", async () => {
    await container.outboxRelay.stop();
  });

  return app;
}
