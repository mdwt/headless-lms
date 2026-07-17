// integrations context — public surface. Re-export only what other contexts may use.
export { IntegrationsServiceImpl } from "./service.js";
export { createIntegrationsRegistry } from "./registry.js";
export { zodConfig, zodSecrets, zodAction } from "@headless-lms/integration-sdk";
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
  Validation,
} from "./ports.js";
export type { Connection, ConnectInput, ConfigureInput } from "./model.js";
export type { ConnectionCreated, ConnectionUpdated, ConnectionRemoved } from "./events.js";
