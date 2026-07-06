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
import { ConnectedApps } from "@headless-lms/sdk";

import { ensureConfigured, authHeaders, expectOk } from "@/lib/api/server-call";


export async function revokeConnectedAppAction(id: string): Promise<void> {
  ensureConfigured();
  expectOk(await ConnectedApps.revokeConnectedApp({ path: { id }, ...(await authHeaders()) }));
  revalidatePath("/connected-apps");
}
