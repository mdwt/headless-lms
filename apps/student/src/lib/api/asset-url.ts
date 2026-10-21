import "server-only";

/**
 * Host-side asset URL broker for lesson content (student counterpart of the
 * admin resolver — the editor contract's `resolveAssetUrl`).
 *
 * Media nodes persist a durable `assetId`; the render hands this broker to
 * the plugin's Renderer and each node mints a fresh presigned URL for itself
 * via the member download-url broker — access stays time-limited and scoped to
 * the session's portal org.
 */

import { unstable_rethrow } from "next/navigation";
import { Assets } from "@headless-lms/sdk";

import { authHeaders } from "./server-call";
import { ApiError } from "./shared";

/** Fresh presigned URL for an asset, or null when the asset no longer exists. */
export async function resolveAssetUrl(assetId: string): Promise<string | null> {
  try {
    const ticket = await Assets.getAssetDownloadUrl({ id: assetId }, await authHeaders());
    return ticket.url;
  } catch (e) {
    // A 401 redirects by throwing, so let Next's control-flow errors pass.
    unstable_rethrow(e);
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}
