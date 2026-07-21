import "server-only";

/**
 * Shared plumbing for server-side SDK reads. Centralizes the API base URL, the
 * one-time SDK `configureSdk`, and the per-call cookie-forward header bag.
 *
 * The SDK `client` is a module-level singleton shared across all concurrent
 * requests, so the cookie is threaded per-call via the `headers` option — never
 * `client.setConfig` with request state (which would leak cookies between users).
 */
import { cookies } from "next/headers";
import { configureSdk } from "@headless-lms/sdk";

export const API_URL =
  process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

let configured = false;
export function ensureConfigured(): void {
  if (configured) return;
  configureSdk({ baseUrl: API_URL });
  configured = true;
}

/** Per-call header bag forwarding the incoming request's session cookie. */
export async function authHeaders(): Promise<{ headers: { cookie: string } }> {
  return { headers: { cookie: (await cookies()).toString() } };
}
