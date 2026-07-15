// integrations context — public surface. Re-export only what other contexts may use.
export { IntegrationsServiceImpl } from "./service.js";
export { createIntegrationsRegistry } from "./registry.js";
export { zodConfig, zodAction } from "./validation.js";
export {
  AlreadyConnectedError,
  UnknownIntegrationError,
  InvalidConfigError,
} from "./model.js";
export type {
  IntegrationsService,
  ConnectionsRepository,
  Integration,
  IntegrationsRegistry,
  AvailableIntegration,
  Action,
  ActionContext,
} from "./ports.js";
export type { Connection, ConnectInput, ConfigureInput, Validation } from "./model.js";
export type { ConnectionCreated, ConnectionUpdated, ConnectionRemoved } from "./events.js";
