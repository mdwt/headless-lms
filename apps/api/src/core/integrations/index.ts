// integrations context — public surface. Re-export only what other contexts may use.
export { IntegrationsServiceImpl } from "./service.js";
export { AlreadyConnectedError } from "./model.js";
export type { IntegrationsService, ConnectionsRepository } from "./ports.js";
export type { Connection, ConnectInput, ConfigureInput } from "./model.js";
export type { ConnectionCreated, ConnectionUpdated, ConnectionRemoved } from "./events.js";
