// Inbound: scheduled triggers. Imports the container, schedules jobs. Stub.
import { buildContainer } from "../composition/container.js";
import { loadConfigFromEnv } from "../composition/config.js";

export function startCron(): void {
  const container = buildContainer(loadConfigFromEnv());
  void container;
}
