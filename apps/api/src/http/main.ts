// Process entry point: loads config, builds the server, and starts listening.
// Kept separate from `server.ts` so `buildServer` can be imported (tests,
// OpenAPI generation) without booting a listener.
import { buildServer } from "./server.js";
import { loadServerConfig } from "./config.js";

const config = loadServerConfig();
const app = await buildServer(config);

app.listen({ port: config.port, host: config.host }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
