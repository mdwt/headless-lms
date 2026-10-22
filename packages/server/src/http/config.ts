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
  /** Presigned URL lifetime for entitled download delivery, seconds. Separate
   *  from the storage adapter's general download expiry so raising that one
   *  can't silently extend paywalled link lifetimes. */
  deliveryExpirySeconds: number;
  /** Largest member image upload accepted at confirm, in bytes. */
  memberImageMaxBytes: number;
  /** Everything the composition container needs to wire adapters + services. */
  container: Config;
}
