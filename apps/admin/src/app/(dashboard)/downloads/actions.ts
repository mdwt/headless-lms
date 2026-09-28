"use server";

// Server actions for download mutations.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Content } from "@headless-lms/sdk";

import { authHeaders } from "@/lib/api/server-call";
import { composeDownloadAssets } from "@/lib/api/server";
import type { Download, DownloadAsset } from "@/lib/api/types";

/** Download-level writes surface on both the list and that download's page. */
function revalidateDownload(): void {
  revalidatePath("/downloads");
  revalidatePath("/downloads/[downloadId]", "page");
}

export interface DownloadInput {
  title: string;
  category?: string;
  description?: string;
}

/**
 * A genuine partial update — `title` is optional so a caller changing only
 * one field (e.g. the thumbnail) can omit the rest instead of resending a
 * stale value that would clobber a concurrent edit. Split from `DownloadInput`
 * rather than widening it, since create still requires a title.
 */
export interface DownloadPatch {
  title?: string;
  category?: string;
  description?: string;
  status?: Download["status"];
  thumbnailAssetId?: string | null;
}

export async function createDownloadAction(input: DownloadInput): Promise<Download> {
  const download = await Content.createDownload(
    { title: input.title, description: input.description, category: input.category },
    await authHeaders(),
  );
  revalidateDownload();
  return download;
}

export async function updateDownloadAction(
  downloadId: string,
  patch: DownloadPatch,
): Promise<Download> {
  const download = await Content.updateDownload(
    {
      downloadId,
      title: patch.title,
      description: patch.description,
      category: patch.category,
      status: patch.status,
      thumbnailAssetId: patch.thumbnailAssetId,
    },
    await authHeaders(),
  );
  revalidateDownload();
  return download;
}

/** Publish/unpublish — a targeted status write for the row action + optimism. */
export async function setDownloadPublishedAction(
  downloadId: string,
  status: Download["status"],
): Promise<void> {
  await Content.updateDownload({ downloadId, status }, await authHeaders());
  revalidateDownload();
}

export async function deleteDownloadAction(downloadId: string): Promise<void> {
  await Content.deleteDownload({ downloadId }, await authHeaders());
  revalidateDownload();
}

/**
 * Delete then redirect from inside the action — for the download's own page.
 * A client-side `router.push` after a revalidating action races the current
 * route's re-render, which re-fetches the now-deleted download and throws
 * into the error boundary. `redirect()` short-circuits that re-render
 * entirely, so the client never re-renders the dead route.
 */
export async function deleteDownloadAndRedirectAction(downloadId: string): Promise<void> {
  await Content.deleteDownload({ downloadId }, await authHeaders());
  revalidatePath("/downloads");
  redirect("/downloads");
}

export async function addDownloadAssetAction(
  downloadId: string,
  assetId: string,
  displayName?: string,
): Promise<DownloadAsset[]> {
  const links = await Content.addDownloadAsset(
    { downloadId, assetId, displayName },
    await authHeaders(),
  );
  revalidateDownload();
  return composeDownloadAssets(links);
}

export async function renameDownloadAssetAction(
  downloadId: string,
  assetId: string,
  displayName: string | null,
): Promise<DownloadAsset[]> {
  const links = await Content.renameDownloadAsset(
    { downloadId, assetId, displayName },
    await authHeaders(),
  );
  revalidateDownload();
  return composeDownloadAssets(links);
}

export async function removeDownloadAssetAction(
  downloadId: string,
  assetId: string,
): Promise<DownloadAsset[]> {
  const links = await Content.removeDownloadAsset({ downloadId, assetId }, await authHeaders());
  revalidateDownload();
  return composeDownloadAssets(links);
}

export async function reorderDownloadAssetsAction(
  downloadId: string,
  assetIds: string[],
): Promise<DownloadAsset[]> {
  const links = await Content.reorderDownloadAssets({ downloadId, assetIds }, await authHeaders());
  revalidateDownload();
  return composeDownloadAssets(links);
}
