// Process entry point: env → config → container → server → listen → relay.
import { fileURLToPath } from "node:url";
import { buildServer, createContainer } from "@headless-lms/server";
import { ResendEmailAdapter } from "@headless-lms/adapter-email-resend";
import { MinioStorageAdapter } from "@headless-lms/adapter-storage-minio";
import { HatchetAutomationEngine } from "@headless-lms/adapter-workflow-hatchet";
import { ReactEmailTemplateRenderer } from "@headless-lms/adapter-email-templates";
import { loadEmailConfig, loadServerConfig, loadStorageConfig } from "./config.js";

const config = loadServerConfig();
const emailConfig = loadEmailConfig();
const container = await createContainer(config, {
  pluginsDir: fileURLToPath(new URL("./plugins/", import.meta.url)),
  adapters: {
    email: emailConfig && new ResendEmailAdapter(emailConfig),
    storage: new MinioStorageAdapter(loadStorageConfig()),
    templates: new ReactEmailTemplateRenderer(),
    workflows: (logger) => new HatchetAutomationEngine(undefined, logger),
  },
});
const app = await buildServer(config, container);

try {
  await app.listen({ port: config.port, host: config.host });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

container.outboxRelay.start();
container.automationEngine.start().catch((err) => {
  container.logger.error("automation engine failed to start", {
    err: err instanceof Error ? err : new Error(String(err)),
  });
});
