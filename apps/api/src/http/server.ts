// Inbound HTTP server. `buildServer` wires the Fastify instance from focused
// plugins — each concern lives in its own module (config, CORS, OpenAPI, auth,
// error handling, routes) so this file stays a readable table of contents.
import Fastify, { type FastifyInstance } from "fastify";
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";
import { buildContainer } from "../composition/container.js";
import { loadServerConfig, type ServerConfig } from "./config.js";
import { registerCors } from "./plugins/cors.js";
import { registerOpenApi } from "./plugins/openapi.js";
import { registerAuth } from "./plugins/auth.js";
import { registerErrorHandler } from "./plugins/error-handler.js";
import { registerRoutes } from "./routes.js";

export function buildServer(config: ServerConfig = loadServerConfig()): FastifyInstance {
  const app = Fastify({ logger: true });
  const container = buildContainer(config.container);

  // Validate + serialize request/response bodies from the shared Zod contract.
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  registerCors(app, config);
  registerOpenApi(app, config);
  registerAuth(app, container);
  registerErrorHandler(app);
  registerRoutes(app, container);

  return app;
}
