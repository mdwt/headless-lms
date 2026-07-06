"use server";

/**
 * Media (assets) mutations + presigned-URL brokering as Server Actions — the
 * write/side-effect half of the pure-RSC (BFF) model. Each runs on the server,
 * calls the API via the generated SDK with the incoming request's cookie
 * forwarded per-call (never mutating the shared SDK singleton — same rule as
 * `lib/api/server.ts`), then `revalidatePath("/media")`s the list so the next
 * render streams fresh rows. No client-side cache, no react-query.
 *
 * The one irreducibly client-side step — the direct-to-storage PUT with upload
 * progress — is NOT here: `requestUploadAction` hands the client a presigned
 * ticket, the browser PUTs the bytes over XHR (see `upload-to-storage.ts`), and
 * `confirmAssetAction` captures the result. Presigned preview/download URLs are
 * brokered by `getAssetUrlAction` and fetched on demand (never long-cached).
 */

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { Assets, configureSdk } from "@headless-lms/sdk";

import { unwrap, expectOk } from "@/lib/api/shared";
import type { AssetKind, UploadTicket } from "@/lib/api/types";

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

export async function deleteAssetAction(id: string): Promise<void> {
  ensureConfigured();
  expectOk(await Assets.deleteAsset({ path: { id }, ...(await auth()) }));
  revalidatePath("/media");
}

/**
 * Broker a short-lived presigned URL for previewing/serving an asset. Fetched
 * on demand by the grid/preview components — not cached long-term (these URLs
 * expire within minutes).
 */
export async function getAssetUrlAction(id: string, filename?: string): Promise<string> {
  ensureConfigured();
  const ticket = unwrap(
    await Assets.requestAssetDownload({ path: { id }, body: { filename }, ...(await auth()) }),
  );
  return ticket.url;
}

export interface UploadMeta {
  filename: string;
  contentType: string;
  kind: AssetKind;
}

/**
 * Step 1 of upload: register the asset and mint a presigned PUT ticket. The
 * client PUTs the bytes straight to object storage (XHR, with progress), then
 * calls `confirmAssetAction`.
 */
export async function requestUploadAction(meta: UploadMeta): Promise<UploadTicket> {
  ensureConfigured();
  return unwrap(await Assets.requestUpload({ body: meta, ...(await auth()) }));
}

/** Step 3 of upload: confirm so the API captures the final size/content-type. */
export async function confirmAssetAction(id: string): Promise<void> {
  ensureConfigured();
  unwrap(await Assets.confirmAsset({ path: { id }, ...(await auth()) }));
  revalidatePath("/media");
}
