// Inbound: scheduled triggers. Imports the container, schedules jobs. Stub.
import { buildContainer } from "../composition/container.js";
import { loadConfigFromEnv } from "../composition/config.js";

export async function startCron(): Promise<void> {
  const container = await buildContainer(loadConfigFromEnv());
  void container;
}
