// Process entry point: env → config → container → server → listen.
import { fileURLToPath } from "node:url";
import { createContainer, buildServer } from "@headless-lms/server";
import { loadServerConfig } from "./config.js";

const config = loadServerConfig();
const container = await createContainer(config, {
  // One folder per integration (directory name = integration id). Compiled
  // to dist/plugins/ by the standard build, so this resolves in dev and prod.
  pluginsDir: fileURLToPath(new URL("./plugins/", import.meta.url)),
});
const app = await buildServer(config, container);

app.listen({ port: config.port, host: config.host }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
