import { requireManager } from "@/lib/auth/server-session";
import { serverApi } from "@/lib/api/server";

import { IntegrationsView } from "./integrations-view";

// Integrations page: what this deployment supports (from the plugin registry)
// merged with the org's connections. Fetches server-side, renders the client view.
export default async function IntegrationsPage() {
  // Start both fetches immediately, await the manager gate, then the data —
  // the API round-trips run in parallel instead of sequentially.
  const dataPromise = Promise.all([
    serverApi.listAvailableIntegrations(),
    serverApi.listConnections(),
  ]);
  await requireManager(dataPromise);
  const [available, connections] = await dataPromise;

  const rows = available.map((integration) => ({
    integration,
    connection: connections.find((c) => c.integrationId === integration.id) ?? null,
  }));

  return <IntegrationsView rows={rows} />;
}
