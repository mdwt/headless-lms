// HTTP routes for the dashboard (overview) context.
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { OverviewStats } from "@headless-lms/api-contract";
import type { Container } from "../../composition/container.js";
import { resolveScope } from "../scope.js";

export async function dashboardRoutes(app: FastifyInstance, container: Container): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.route({
    method: "GET",
    url: "/api/overview",
    preHandler: app.requireSession,
    schema: {
      operationId: "getOverview",
      tags: ["Dashboard"],
      summary: "Back-office overview stats",
      response: { 200: OverviewStats },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return container.reporting.dashboard.overview(scope.orgId);
    },
  });
}
