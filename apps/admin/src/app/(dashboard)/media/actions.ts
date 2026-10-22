"use server";

// Server actions for media (asset) mutations and presigned-URL brokering.

import { revalidatePath } from "next/cache";
import { Assets } from "@headless-lms/sdk";

import { authHeaders } from "@/lib/api/server-call";
import { toQuery } from "@/lib/api/shared";
import type { Asset, ListParams, Paginated, UploadTicket } from "@/lib/api/types";

/**
 * Client-callable asset list. The media *page* reads through `serverApi` during
 * SSR; this exists for client surfaces that filter and page on their own —
 * currently the editor's library picker dialog.
 */
export async function listAssetsAction(params: ListParams): Promise<Paginated<Asset>> {
  return await Assets.listAssets(toQuery(params, ["kind"]), await authHeaders());
}

export async function deleteAssetAction(id: string): Promise<void> {
  await Assets.deleteAsset({ id }, await authHeaders());
  revalidatePath("/media");
}

/**
 * Broker a short-lived presigned URL for previewing/serving an asset. Fetched
 * on demand by the grid/preview components — not cached long-term (these URLs
 * expire within minutes).
 */
export async function getAssetUrlAction(id: string, filename?: string): Promise<string> {
  const ticket = await Assets.requestAssetDownload({ id, filename }, await authHeaders());
  return ticket.url;
}

export interface UploadMeta {
  filename: string;
  contentType: string;
}

/**
 * Step 1 of upload: register the asset and mint a presigned PUT ticket. The
 * client PUTs the bytes straight to object storage (XHR, with progress), then
 * calls `confirmAssetAction`.
 */
export async function requestUploadAction(meta: UploadMeta): Promise<UploadTicket> {
  return await Assets.requestUpload(meta, await authHeaders());
}

/** Step 3 of upload: confirm so the API captures the final size/content-type. */
export async function confirmAssetAction(id: string): Promise<void> {
  await Assets.confirmAsset({ id }, await authHeaders());
  revalidatePath("/media");
}
