// Mounts every route on the server, grouped by auth model:
//   - /health
//   - back-office routes: guarded by a session on EVERY route (see below)
//   - MCP: guarded by OAuth bearer tokens, so it sits outside the session plugin
import type { FastifyInstance } from "fastify";
import type { Container } from "../composition/container.js";
import { coursesRoutes } from "./routes/courses.js";
import { activitiesRoutes } from "./routes/activities.js";
import { studentsRoutes } from "./routes/students.js";
import { entitlementsRoutes } from "./routes/entitlements.js";
import { organizationsRoutes } from "./routes/organizations.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { assetsRoutes } from "./routes/assets.js";
import { connectedAppsRoutes } from "./routes/connected-apps.js";
import { integrationsRoutes } from "./routes/integrations.js";
import { mcpRoutes } from "./mcp/route.js";

export function registerRoutes(app: FastifyInstance, container: Container): void {
  app.get("/health", async () => ({ status: "ok" }));

  // Back-office routes (validated against the shared contract). A scoped
  // onRequest hook enforces the session on EVERY route in this plugin, so a new
  // route cannot accidentally be public; the per-route `requireSession`
  // preHandlers remain as explicit, idempotent belt-and-suspenders.
  app.register(async (instance) => {
    instance.addHook("onRequest", instance.requireSession);
    await coursesRoutes(instance, container);
    await activitiesRoutes(instance, container);
    await studentsRoutes(instance, container);
    await entitlementsRoutes(instance, container);
    await organizationsRoutes(instance, container);
    await dashboardRoutes(instance, container);
    await assetsRoutes(instance, container);
    await connectedAppsRoutes(instance, container);
    await integrationsRoutes(instance, container);
  });

  // MCP endpoint authenticates via OAuth bearer tokens (withMcpAuth), NOT the
  // session cookie — registered outside the session-guarded plugin above.
  app.register(async (instance) => {
    await mcpRoutes(instance, container);
  });
}
