// integrations context — registry. The set of available integrations is
// declared once at startup (composition passes the modules in); the service
// consults it to reject unknown integration ids and to validate config.
import type { Integration, IntegrationsRegistry } from "./ports.js";

export function createIntegrationsRegistry(integrations: Integration[]): IntegrationsRegistry {
  const byId = new Map<string, Integration>();
  for (const integration of integrations) {
    if (byId.has(integration.id)) {
      throw new Error(`duplicate integration id "${integration.id}"`);
    }
    byId.set(integration.id, integration);
  }
  return {
    get: (id) => byId.get(id) ?? null,
    list: () => [...byId.values()],
  };
}
