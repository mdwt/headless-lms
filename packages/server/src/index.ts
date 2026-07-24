// Public surface of @headless-lms/server. Installations compose these:
//   const container = await createContainer(config, { pluginsDir, adapters })
//   const app = await buildServer(config, container)
import {
  buildContainer,
  type BuildContainerOptions,
  type Container,
} from './app/container.js';
import type { ServerConfig } from './http/config.js';

export { buildServer } from './http/server.js';
export { loadIntegrations } from './app/integrations.js';
export { InlineAutomationEngine } from './adapters/workflows/index.js';
// Operational functions consumed by the @headless-lms/cli bin.
export { runMigrations } from './app/migrate.js';
export type { ServerConfig } from './http/config.js';
// Re-exporting AuthUser also pulls its module into any program that imports
// this file (directly or via the workspace path mapping), which is what
// applies its ambient `declare module "fastify"` augmentation
// (FastifyRequest.authUser/orgId, FastifyInstance.requireSession) —
// otherwise nothing imports fastify.d.ts and the augmentation never loads.
export type { AuthUser } from './http/fastify.js';
export type {
  Config as ContainerConfig,
  Container,
  AdapterOverrides,
  BuildContainerOptions,
  LoggingConfig,
} from './app/container.js';
export type { EmailSender, EmailMessage, ObjectStorage } from './core/shared/ports.js';
export type { Mailer } from './core/shared/mailer.js';
export type { AutomationEngine } from './core/automations/index.js';

export async function createContainer(
  config: ServerConfig,
  options?: BuildContainerOptions,
): Promise<Container> {
  return buildContainer(config.container, options);
}
