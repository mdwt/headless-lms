import "server-only";

/**
 * Shared plumbing for server-side SDK calls (RSC reads in `server.ts` and every
 * route's Server Actions). Centralizes the API base URL, the one-time SDK
 * `configureSdk`, and the per-call cookie-forward header bag so the boilerplate
 * lives in one place and can't drift between files.
 *
 * The SDK `client` is a module-level singleton shared across all concurrent
 * requests, so the cookie is threaded per-call via the `headers` option — never
 * `client.setConfig` with request state (which would leak cookies between users).
 */

import { cookies } from "next/headers";
import { configureSdk } from "@headless-lms/sdk";
import { redirect } from "next/navigation";

import { ApiError } from "./http";
import { unwrap as baseUnwrap, expectOk as baseExpectOk, type SdkResult } from "./shared";

export const API_URL =
  process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

let configured = false;
export function ensureConfigured(): void {
  if (configured) return;
  // baseUrl only — the cookie is passed per-call, never on the shared client.
  configureSdk({ baseUrl: API_URL });
  configured = true;
}

/** Per-call header bag forwarding the incoming request's session cookie. */
export async function authHeaders(): Promise<{ headers: { cookie: string } }> {
  return { headers: { cookie: (await cookies()).toString() } };
}

/**
 * Action-side unwrap: like `shared.unwrap`, but a 401 (expired/absent session
 * during a mutation) redirects to `/login` instead of surfacing a generic error
 * toast. 403 (authenticated but forbidden) still throws — the caller is logged
 * in, just not allowed, so it belongs in an error message, not a login bounce.
 */
export function unwrap<T>(result: SdkResult<T>): T {
  try {
    return baseUnwrap(result);
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) redirect("/login");
    throw e;
  }
}

export function expectOk(result: SdkResult<unknown>): void {
  try {
    baseExpectOk(result);
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) redirect("/login");
    throw e;
  }
}
