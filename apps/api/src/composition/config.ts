// Reads container configuration from the environment. Used by every entry point.
import type { Config } from "./container.js";

export function loadConfigFromEnv(): Config {
  const clientOrigin = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";
  return {
    databaseUrl: process.env.DATABASE_URL ?? "",
    authBaseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
    authSecret: process.env.BETTER_AUTH_SECRET ?? "",
    trustedOrigins: [clientOrigin],
    storage: {
      endPoint: process.env.STORAGE_ENDPOINT ?? "localhost",
      port: Number(process.env.STORAGE_PORT ?? 9000),
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
