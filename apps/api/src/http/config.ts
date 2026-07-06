// Server-level configuration for the HTTP entry point. The container's config
// (db, auth, storage, …) is read once by `loadConfigFromEnv`; this only adds the
// bits that are the HTTP server's own concern: the listen address, the public
// URL advertised in the OpenAPI spec, and the CORS allow-list.
import type { Config } from "../composition/container.js";
import { loadConfigFromEnv, parseClientOrigins } from "../composition/config.js";

export interface ServerConfig {
  /** TCP port to listen on. */
  port: number;
  /** Bind address. */
  host: string;
  /** The API's own origin, advertised as the OpenAPI server URL. */
  publicUrl: string;
  /** Browser app origins allowed by CORS. */
  clientOrigins: string[];
  /** Everything the composition container needs to wire adapters + services. */
  container: Config;
}

export function loadServerConfig(): ServerConfig {
  const container = loadConfigFromEnv();
  return {
    port: Number(process.env.PORT ?? 8000),
    host: process.env.HOST ?? "0.0.0.0",
    // `authBaseURL` is the API's own origin (BETTER_AUTH_URL); reuse it so the
    // public URL can never drift from what better-auth is configured with.
    publicUrl: container.authBaseURL,
    clientOrigins: parseClientOrigins(),
    container,
  };
}
