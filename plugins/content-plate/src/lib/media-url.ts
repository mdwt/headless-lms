import type { ResolveAssetUrl } from "@headless-lms/editor";

/**
 * Displayable URL for a media element: the host-brokered fresh presign when
 * the node is backed by an asset, else the embedded URL (external media, or
 * hosts that track no assets).
 */
export async function freshMediaUrl(
  element: { assetId?: unknown; url?: unknown },
  resolveAssetUrl?: ResolveAssetUrl,
): Promise<string | undefined> {
  const stored = typeof element.url === "string" ? element.url : undefined;
  const assetId = typeof element.assetId === "string" ? element.assetId : undefined;
  if (!assetId || !resolveAssetUrl) return stored;
  return (await resolveAssetUrl(assetId)) ?? stored;
}
