// Inbound: queue consumers. Imports the container, starts consuming. Stub.
import { buildContainer } from "../composition/container.js";
import { loadConfigFromEnv } from "../composition/config.js";

export function startWorkers(): void {
  const container = buildContainer(loadConfigFromEnv());
  void container;
}
