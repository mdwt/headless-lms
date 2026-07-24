// Process entry point: env → config → container → server → listen → relay.
import { fileURLToPath } from "node:url";
import { createContainer, buildServer } from "@headless-lms/server";
import { ResendEmailAdapter } from "@headless-lms/adapter-email-resend";
import { MinioStorageAdapter } from "@headless-lms/adapter-storage-minio";
import { HatchetAutomationEngine } from "@headless-lms/adapter-workflow-hatchet";
import { ReactEmailTemplateRenderer } from "@headless-lms/adapter-email-templates";
import { loadServerConfig, loadEmailConfig, loadStorageConfig, hatchetEnabled } from "./config.js";

const config = loadServerConfig();
const emailConfig = loadEmailConfig();
const container = await createContainer(config, {
  pluginsDir: fileURLToPath(new URL("./plugins/", import.meta.url)),
  adapters: {
    email: emailConfig && new ResendEmailAdapter(emailConfig),
    storage: new MinioStorageAdapter(loadStorageConfig()),
    templates: new ReactEmailTemplateRenderer(),
    workflows: hatchetEnabled() ? new HatchetAutomationEngine() : undefined,
  },
});
const app = await buildServer(config, container);

try {
  await app.listen({ port: config.port, host: config.host });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

// Start the outbox relay and the automation engine ONLY here, after listen —
// never from an onReady hook: gen-openapi boots this same container via
// app.ready() during `pnpm gen:sdk` and must not begin polling/working.
// buildServer's onClose stops both.
container.outboxRelay.start();
// HatchetAutomationEngine.start() runs the worker in the background
// internally and never rejects; InlineAutomationEngine.start() is a no-op.
container.automationEngine.start();
