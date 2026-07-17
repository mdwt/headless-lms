// Public surface of @headless-lms/server. Installations compose these:
//   const container = await createContainer(config, { pluginsDir, adapters })
//   const app = await buildServer(config, container)
import { buildContainer, type BuildContainerOptions, type Container } from "./composition/container.js";
import type { ServerConfig } from "./http/config.js";

export { buildServer } from "./http/server.js";
export { loadIntegrations } from "./composition/integrations.js";
export type { ServerConfig } from "./http/config.js";
export type {
  Config as ContainerConfig,
  Container,
  AdapterOverrides,
  BuildContainerOptions,
} from "./composition/container.js";
export type { EmailSender, EmailMessage, ObjectStorage } from "./core/shared/ports.js";
export type { MinioStorageConfig } from "./adapters/storage/index.js";

export async function createContainer(
  config: ServerConfig,
  options?: BuildContainerOptions,
): Promise<Container> {
  return buildContainer(config.container, options);
}
