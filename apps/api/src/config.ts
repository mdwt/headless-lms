// Reads all runtime configuration from the environment and builds the
// ServerConfig that @headless-lms/server consumes. The only file that
// touches process.env.
import type { ServerConfig, ContainerConfig } from "@headless-lms/server";
import type { ResendEmailConfig } from "@headless-lms/adapter-email-resend";
import type { MinioStorageConfig } from "@headless-lms/adapter-storage-minio";

/** RESEND_API_KEY unset → no transport; email sends fail loudly. */
export function loadEmailConfig(): ResendEmailConfig | undefined {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return undefined;
  }
  return { apiKey, from: process.env.EMAIL_FROM ?? "onboarding@resend.dev" };
}

export function loadStorageConfig(): MinioStorageConfig {
  return {
    endPoint: process.env.STORAGE_ENDPOINT ?? "localhost",
    port: Number(process.env.STORAGE_PORT ?? 8006),
    useSSL: (process.env.STORAGE_USE_SSL ?? "false") === "true",
    accessKey: process.env.STORAGE_ACCESS_KEY ?? "minioadmin",
    secretKey: process.env.STORAGE_SECRET_KEY ?? "minioadmin",
    region: process.env.STORAGE_REGION ?? "us-east-1",
    bucket: process.env.STORAGE_BUCKET ?? "headless-lms",
    uploadExpirySeconds: Number(process.env.STORAGE_UPLOAD_EXPIRY ?? 300),
    downloadExpirySeconds: Number(process.env.STORAGE_DOWNLOAD_EXPIRY ?? 300),
  };
}

/** Browser app origins from CLIENT_ORIGIN (comma-separated). */
export function parseClientOrigins(): string[] {
  return (process.env.CLIENT_ORIGIN ?? "http://localhost:8001,http://localhost:8002")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
}

const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;
type LogLevel = (typeof LOG_LEVELS)[number];

/** LOG_LEVEL env → logging.level; unset → server default ("info"). */
function parseLogLevel(): LogLevel | undefined {
  const raw = process.env.LOG_LEVEL;
  if (!raw) {
    return undefined;
  }
  if (!(LOG_LEVELS as readonly string[]).includes(raw)) {
    throw new Error(`invalid LOG_LEVEL "${raw}" (expected one of ${LOG_LEVELS.join(", ")})`);
  }
  return raw as LogLevel;
}

function loadContainerConfig(): ContainerConfig {
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
    cookieDomain: process.env.AUTH_COOKIE_DOMAIN || undefined,
    secureCookies: process.env.NODE_ENV === "production",
    outbox: {
      enabled: (process.env.OUTBOX_ENABLED ?? "true") !== "false",
    },
    logging: {
      level: parseLogLevel(),
    },
  };
}

export function loadServerConfig(): ServerConfig {
  const container = loadContainerConfig();
  return {
    port: Number(process.env.PORT ?? 8000),
    host: process.env.HOST ?? "0.0.0.0",
    // BETTER_AUTH_URL is the API's own origin; reuse it so the public URL
    // can never drift from what better-auth is configured with.
    publicUrl: container.authBaseURL,
    clientOrigins: parseClientOrigins(),
    container,
  };
}
