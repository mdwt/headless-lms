// Reads container configuration from the environment. Used by every entry point.
import type { Config } from "./container.js";

/**
 * Browser app origins (student web app + admin dashboard) from `CLIENT_ORIGIN`,
 * a comma-separated list. Each is allowed for CORS and registered as a trusted
 * origin so better-auth accepts its requests and sets cookies for it.
 */
export function parseClientOrigins(): string[] {
  return (process.env.CLIENT_ORIGIN ?? "http://localhost:8001,http://localhost:8002")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
}

export function loadConfigFromEnv(): Config {
  const clientOrigins = parseClientOrigins();
  const apiOrigin = process.env.BETTER_AUTH_URL ?? "http://localhost:8000";
  const trustedOrigins = [...new Set([...clientOrigins, apiOrigin])];
  return {
    databaseUrl: process.env.DATABASE_URL ?? "",
    authBaseURL: apiOrigin,
    authSecret: process.env.BETTER_AUTH_SECRET ?? "",
    trustedOrigins,
    mcpLoginPage: process.env.MCP_LOGIN_PAGE ?? "http://localhost:8001/login",
    credentialStoreKey: process.env.CREDENTIAL_STORE_KEY ?? "",
    storage: {
      endPoint: process.env.STORAGE_ENDPOINT ?? "localhost",
      port: Number(process.env.STORAGE_PORT ?? 8006),
      useSSL: (process.env.STORAGE_USE_SSL ?? "false") === "true",
      accessKey: process.env.STORAGE_ACCESS_KEY ?? "minioadmin",
      secretKey: process.env.STORAGE_SECRET_KEY ?? "minioadmin",
      region: process.env.STORAGE_REGION ?? "us-east-1",
      bucket: process.env.STORAGE_BUCKET ?? "headless-lms",
      uploadExpirySeconds: Number(process.env.STORAGE_UPLOAD_EXPIRY ?? 300),
      downloadExpirySeconds: Number(process.env.STORAGE_DOWNLOAD_EXPIRY ?? 300),
    },
  };
}
