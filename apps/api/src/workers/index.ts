// Inbound: queue consumers. Imports the container, starts consuming. Stub.
import { buildContainer } from "../composition/container.js";
import { loadConfigFromEnv } from "../composition/config.js";

export async function startWorkers(): Promise<void> {
  const container = await buildContainer(loadConfigFromEnv());
  void container;
}
