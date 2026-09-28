// Public surface of @headless-lms/server. Installations compose these:
//   const container = await createContainer(config, { pluginsDir, adapters })
//   const app = await buildServer(config, container)
import { buildContainer, type BuildContainerOptions, type Container } from './app/container.js';
import type { ServerConfig } from './http/config.js';

export { buildServer } from './http/server.js';
export { loadIntegrations } from './app/integrations.js';
export { InlineAutomationEngine } from '@headless-lms/adapter-defaults/workflows';
// Operational functions consumed by the @headless-lms/cli bin.
export { runMigrations } from '@headless-lms/adapter-db';
export type { ServerConfig } from './http/config.js';
// Re-exporting AuthUser also pulls its module into any program that imports
// this file (directly or via the workspace path mapping), which is what
// applies its ambient `declare module "fastify"` augmentation
// (FastifyRequest.authUser/orgId, FastifyInstance.requireOrgSession) —
// otherwise nothing imports fastify.d.ts and the augmentation never loads.
export type { AuthUser } from './http/fastify.js';
export type {
  Config as ContainerConfig,
  Container,
  AdapterOverrides,
  BuildContainerOptions,
  LoggingConfig,
} from './app/container.js';
export type { EmailSender, EmailMessage, ObjectStorage } from '@headless-lms/core/shared/ports';
export type { Mailer } from '@headless-lms/core/shared/mailer';
export type { AutomationEngine } from '@headless-lms/core/automations';

export async function createContainer(
  config: ServerConfig,
  options?: BuildContainerOptions,
): Promise<Container> {
  return buildContainer(
    { ...config.container, deliveryExpirySeconds: config.deliveryExpirySeconds },
    options,
  );
}
