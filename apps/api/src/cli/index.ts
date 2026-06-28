// Inbound: CLI command entry points. Imports the container, runs a command.
import { buildContainer } from "../composition/container.js";
import { loadConfigFromEnv } from "../composition/config.js";

export function main(_argv: string[]): void {
  const container = buildContainer(loadConfigFromEnv());
  void container;
}
