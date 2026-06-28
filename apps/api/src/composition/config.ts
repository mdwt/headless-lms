// Reads container configuration from the environment. Used by every entry point.
import type { Config } from "./container.js";

export function loadConfigFromEnv(): Config {
  const clientOrigin = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";
  return {
    databaseUrl: process.env.DATABASE_URL ?? "",
    authBaseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
    authSecret: process.env.BETTER_AUTH_SECRET ?? "",
    trustedOrigins: [clientOrigin],
  };
}
