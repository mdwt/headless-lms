"use server";

/**
 * Connected apps mutations as Server Actions — the write half of the pure-RSC
 * (BFF) model. Each runs on the server, calls the API via the generated SDK with
 * the incoming request's cookie forwarded per-call (never mutating the shared
 * SDK singleton — same rule as `lib/api/server.ts`), then
 * `revalidatePath("/connected-apps")` so the next render streams the fresh list.
 * No client-side cache, no react-query: the server owns the data,
 * `revalidatePath` is the refresh.
 */

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { ConnectedApps, configureSdk } from "@headless-lms/sdk";

import { expectOk } from "@/lib/api/shared";

const API_URL =
  process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

let configured = false;
function ensureConfigured(): void {
  if (configured) return;
  configureSdk({ baseUrl: API_URL });
  configured = true;
}

/** Per-call header bag forwarding the caller's session cookie to the API. */
async function auth(): Promise<{ headers: { cookie: string } }> {
  return { headers: { cookie: (await cookies()).toString() } };
}

export async function revokeConnectedAppAction(id: string): Promise<void> {
  ensureConfigured();
  expectOk(await ConnectedApps.revokeConnectedApp({ path: { id }, ...(await auth()) }));
  revalidatePath("/connected-apps");
}
