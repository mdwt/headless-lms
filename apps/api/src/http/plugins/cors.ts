// CORS for the browser apps (student web + admin). Credentials must be allowed
// so the SPA/admin can carry the better-auth session cookie cross-origin.
import type { FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import type { ServerConfig } from "../config.js";

export function registerCors(app: FastifyInstance, config: ServerConfig): void {
  app.register(cors, {
    origin: config.clientOrigins,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
    maxAge: 86400,
  });
}
