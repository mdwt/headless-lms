// Server-level configuration for the HTTP entry point. The package never reads
// process.env — installations build this object (typically from their .env)
// and pass it to createContainer/buildServer.
import type { Config } from '../app/container.js';

export interface ServerConfig {
  /** TCP port to listen on. */
  port: number;
  /** Bind address. */
  host: string;
  /** The API's own origin, advertised as the OpenAPI server URL. */
  publicUrl: string;
  /** Browser app origins allowed by CORS. */
  clientOrigins: string[];
  /** Emit Fastify's per-request "incoming request"/"request completed" lines.
   *  Unset → on. Turn off for a quiet dev console; app-level logs are
   *  unaffected either way. */
  requestLogging?: boolean;
  /** Window of the signed file links a response carries, seconds. A link is the
   *  same all through the window it is signed in and expires at the end of the
   *  next, so it lives between one and two windows. */
  deliveryWindowSeconds: number;
  memberImageMaxBytes: number;
  memberFileMaxBytes: number;
  /** Postgres URL for the PubSub adapter's session connection. It must reach
   *  Postgres directly, not through a transaction-mode pooler. */
  pubsubDatabaseUrl: string;
  /** Everything the composition container needs to wire adapters + services. */
  container: Config;
}
