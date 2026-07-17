// OpenAPI documentation. @fastify/swagger reads the Zod route schemas (via the
// transform) to build the spec the frontend SDK is generated from; it must be
// registered before the routes so its onRoute hook captures them. UI + JSON are
// served under /docs.
import type { FastifyInstance } from "fastify";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { jsonSchemaTransform } from "fastify-type-provider-zod";
import type { ServerConfig } from "../config.js";

export function registerOpenApi(app: FastifyInstance, config: ServerConfig): void {
  app.register(swagger, {
    openapi: {
      info: { title: "Headless LMS API", version: "0.0.0" },
      servers: [{ url: config.publicUrl }],
    },
    transform: jsonSchemaTransform,
  });
  app.register(swaggerUi, { routePrefix: "/docs" });
}
