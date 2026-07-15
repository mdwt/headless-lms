// integrations context — public surface. Re-export only what other contexts may use.
export { IntegrationsServiceImpl } from "./service.js";
export { createIntegrationsRegistry } from "./registry.js";
export { zodConfigValidator } from "./validation.js";
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
} from "./ports.js";
export type { Connection, ConnectInput, ConfigureInput, ConfigValidation } from "./model.js";
export type { ConnectionCreated, ConnectionUpdated, ConnectionRemoved } from "./events.js";
