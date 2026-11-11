// Reads all runtime configuration from the environment and builds the
// ServerConfig that @headless-lms/server consumes. The only file that
// touches process.env.
import type { ServerConfig, ContainerConfig, PushConfig } from "@headless-lms/server";
import type { ResendEmailConfig } from "@headless-lms/adapter-email-resend";
import type { MinioStorageConfig } from "@headless-lms/adapter-storage-minio";

/** EMAIL_SINK_DIR wins over RESEND_API_KEY: development writes every email there. */
export function loadEmailSinkDir(): string | undefined {
  return process.env.EMAIL_SINK_DIR || undefined;
}

/** RESEND_API_KEY unset → no transport; email sends fail loudly. */
export function loadEmailConfig(): ResendEmailConfig | undefined {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return undefined;
  }
  return { apiKey, from: process.env.EMAIL_FROM ?? "onboarding@resend.dev" };
}

function providerEnv(provider: string, names: string[]): Record<string, string> | undefined {
  const values = Object.fromEntries(names.map((name) => [name, process.env[name] ?? ""]));
  const set = names.filter((name) => values[name] !== "");
  if (set.length === 0) {
    return undefined;
  }
  const missing = names.filter((name) => values[name] === "");
  if (missing.length > 0) {
    throw new Error(`incomplete ${provider} push configuration: set ${missing.join(", ")}`);
  }
  return values;
}

/** Push credentials per provider; a provider with none of its variables set is not configured. */
export function loadPushConfig(): PushConfig {
  const push: PushConfig = {};
  const apns = providerEnv("APNs", ["APNS_TEAM_ID", "APNS_KEY_ID", "APNS_KEY", "APNS_BUNDLE_IDS"]);
  if (apns) {
    push.apns = {
      teamId: apns.APNS_TEAM_ID!,
      keyId: apns.APNS_KEY_ID!,
      key: apns.APNS_KEY!.replace(/\\n/g, "\n"),
      bundleIds: apns
        .APNS_BUNDLE_IDS!.split(",")
        .map((id) => id.trim())
        .filter(Boolean),
    };
  }
  const fcm = providerEnv("FCM", ["FCM_SERVICE_ACCOUNT"]);
  if (fcm) {
    let serviceAccount: unknown;
    try {
      serviceAccount = JSON.parse(fcm.FCM_SERVICE_ACCOUNT!);
    } catch {
      throw new Error("invalid FCM_SERVICE_ACCOUNT (expected the service account JSON)");
    }
    if (
      typeof serviceAccount !== "object" ||
      serviceAccount === null ||
      Array.isArray(serviceAccount)
    ) {
      throw new Error("invalid FCM_SERVICE_ACCOUNT (expected the service account JSON)");
    }
    push.fcm = { serviceAccount: serviceAccount as Record<string, unknown> };
  }
  const webpush = providerEnv("Web Push", [
    "VAPID_PUBLIC_KEY",
    "VAPID_PRIVATE_KEY",
    "VAPID_SUBJECT",
  ]);
  if (webpush) {
    push.webpush = {
      publicKey: webpush.VAPID_PUBLIC_KEY!,
      privateKey: webpush.VAPID_PRIVATE_KEY!,
      subject: webpush.VAPID_SUBJECT!,
    };
  }
  return push;
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
    ...(process.env.STORAGE_PUBLIC_URL ? { publicUrl: process.env.STORAGE_PUBLIC_URL } : {}),
    uploadExpirySeconds: Number(process.env.STORAGE_UPLOAD_EXPIRY ?? 300),
  };
}

export function parseMemberImageMaxBytes(): number {
  const raw = process.env.MEMBER_IMAGE_MAX_BYTES;
  if (raw === undefined || raw === "") {
    return 10 * 1024 * 1024;
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`invalid MEMBER_IMAGE_MAX_BYTES "${raw}" (expected a positive integer)`);
  }
  return value;
}

export function parseMemberFileMaxBytes(): number {
  const raw = process.env.MEMBER_FILE_MAX_BYTES;
  if (raw === undefined || raw === "") {
    return 100 * 1024 * 1024;
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`invalid MEMBER_FILE_MAX_BYTES "${raw}" (expected a positive integer)`);
  }
  return value;
}

function parseCount(name: string, min: number): number | undefined {
  const raw = process.env[name];
  if (raw === undefined || raw === "") {
    return undefined;
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min) {
    throw new Error(`invalid ${name} "${raw}" (expected an integer of at least ${min})`);
  }
  return value;
}

export function parseDatabasePool(): NonNullable<ContainerConfig["databasePool"]> {
  const max = parseCount("DATABASE_POOL_MAX", 1);
  const idleTimeoutMillis = parseCount("DATABASE_POOL_IDLE_TIMEOUT_MS", 0);
  const connectionTimeoutMillis = parseCount("DATABASE_POOL_CONNECTION_TIMEOUT_MS", 0);
  return {
    ...(max !== undefined && { max }),
    ...(idleTimeoutMillis !== undefined && { idleTimeoutMillis }),
    ...(connectionTimeoutMillis !== undefined && { connectionTimeoutMillis }),
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

export function loadPlatformConfig(): ContainerConfig["platform"] {
  const key = process.env.PLATFORM_KEY;
  if (!key) {
    return undefined;
  }
  const accountEmail = process.env.PLATFORM_ACCOUNT_EMAIL;
  if (!accountEmail) {
    throw new Error("PLATFORM_KEY is set: set PLATFORM_ACCOUNT_EMAIL too");
  }
  return {
    key,
    accountEmail,
    ...(process.env.PLATFORM_ACCOUNT_NAME && { accountName: process.env.PLATFORM_ACCOUNT_NAME }),
  };
}

function loadContainerConfig(): ContainerConfig {
  const clientOrigins = parseClientOrigins();
  const apiOrigin = process.env.BETTER_AUTH_URL ?? "http://localhost:8000";
  const trustedOrigins = [...new Set([...clientOrigins, apiOrigin])];
  const adminAppUrl = process.env.ADMIN_APP_URL ?? clientOrigins[0] ?? "http://localhost:8001";
  return {
    // Mirrors ServerConfig.deliveryExpirySeconds below — loadServerConfig
    // overrides this with the same value; kept here only so this object
    // satisfies Config on its own.
    deliveryExpirySeconds: Number(process.env.DELIVERY_URL_EXPIRY ?? 21600),
    memberImageMaxBytes: parseMemberImageMaxBytes(),
    memberFileMaxBytes: parseMemberFileMaxBytes(),
    databaseUrl: process.env.DATABASE_URL ?? "",
    databasePool: parseDatabasePool(),
    authBaseURL: apiOrigin,
    authSecret: process.env.BETTER_AUTH_SECRET ?? "",
    trustedOrigins,
    emailBranding: {
      brandName: process.env.BRAND_NAME ?? "Headless LMS",
      baseUrl: adminAppUrl,
    },
    credentialStoreKey: process.env.CREDENTIAL_STORE_KEY ?? "",
    cookieDomain: process.env.AUTH_COOKIE_DOMAIN || undefined,
    secureCookies: process.env.NODE_ENV === "production",
    studentPortalUrl: process.env.STUDENT_PORTAL_URL ?? "http://localhost:8002",
    adminAppUrl,
    outbox: {
      enabled: (process.env.OUTBOX_ENABLED ?? "true") !== "false",
      concurrency: process.env.OUTBOX_CONCURRENCY
        ? Number(process.env.OUTBOX_CONCURRENCY)
        : undefined,
    },
    logging: {
      level: parseLogLevel(),
    },
    webhookAllowPrivateNetwork: process.env.WEBHOOK_ALLOW_PRIVATE_NETWORK === "true",
    platform: loadPlatformConfig(),
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
    // Fastify's per-request access log, one line per request with its id,
    // status and duration. On unless REQUEST_LOGGING=false.
    requestLogging: process.env.REQUEST_LOGGING !== "false",
    deliveryExpirySeconds: Number(process.env.DELIVERY_URL_EXPIRY ?? 21600),
    memberImageMaxBytes: parseMemberImageMaxBytes(),
    memberFileMaxBytes: parseMemberFileMaxBytes(),
    // LISTEN needs a session connection; behind a transaction-mode pooler
    // point PUBSUB_DATABASE_URL at Postgres directly.
    pubsubDatabaseUrl: process.env.PUBSUB_DATABASE_URL || container.databaseUrl,
    container,
  };
}
