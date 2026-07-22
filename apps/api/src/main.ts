// Process entry point: env → config → container → server → listen → relay.
import { fileURLToPath } from "node:url";
import { createContainer, buildServer } from "@headless-lms/server";
import { loadServerConfig } from "./config.js";

const config = loadServerConfig();
const container = await createContainer(config, {
  pluginsDir: fileURLToPath(new URL("./plugins/", import.meta.url)),
});
const app = await buildServer(config, container);

try {
  await app.listen({ port: config.port, host: config.host });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

// Start the outbox relay ONLY here, after listen — never from an onReady
// hook: gen-openapi boots this same container via app.ready() during
// `pnpm gen:sdk` and must not begin polling. buildServer's onClose stops it.
container.outboxRelay.start();
