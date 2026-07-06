"use server";

// Server actions for media (asset) mutations and presigned-URL brokering.

import { revalidatePath } from "next/cache";
import { Assets } from "@headless-lms/sdk";

import { ensureConfigured, authHeaders, unwrap, expectOk } from "@/lib/api/server-call";
import type { AssetKind, UploadTicket } from "@/lib/api/types";


export async function deleteAssetAction(id: string): Promise<void> {
  ensureConfigured();
  expectOk(await Assets.deleteAsset({ path: { id }, ...(await authHeaders()) }));
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
    await Assets.requestAssetDownload({ path: { id }, body: { filename }, ...(await authHeaders()) }),
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
  return unwrap(await Assets.requestUpload({ body: meta, ...(await authHeaders()) }));
}

/** Step 3 of upload: confirm so the API captures the final size/content-type. */
export async function confirmAssetAction(id: string): Promise<void> {
  ensureConfigured();
  unwrap(await Assets.confirmAsset({ path: { id }, ...(await authHeaders()) }));
  revalidatePath("/media");
}
