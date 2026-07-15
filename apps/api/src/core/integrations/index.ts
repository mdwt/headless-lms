// integrations context — public surface. Re-export only what other contexts may use.
export { IntegrationsServiceImpl } from "./service.js";
export { createIntegrationsRegistry } from "./registry.js";
export { stripe } from "./stripe/index.js";
export { slack } from "./slack/index.js";
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
