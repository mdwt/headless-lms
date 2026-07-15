// Inbound: CLI command entry points. Imports the container, runs a command.
import { buildContainer } from "../composition/container.js";
import { loadConfigFromEnv } from "../composition/config.js";

export async function main(_argv: string[]): Promise<void> {
  const container = await buildContainer(loadConfigFromEnv());
  void container;
}
