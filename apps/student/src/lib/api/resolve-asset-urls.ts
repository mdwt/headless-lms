import "server-only";

/**
 * Render-time asset URL signing for lesson content (student counterpart of the
 * admin resolver).
 *
 * Media nodes persist a stable `assetId` alongside a `url` that was presigned
 * at upload time and has long since expired. Before an activity is rendered,
 * the server walks the config and swaps every referenced URL for a freshly
 * minted one via the Learn download-url broker — so access stays time-limited
 * and scoped to the session's portal org, and nothing durable is ever handed
 * out.
 */

import { Learn } from "@headless-lms/sdk";

import { authHeaders, ensureConfigured } from "./server-call";
import { unwrap } from "./shared";

interface AssetNode {
  assetId: string;
  url: string;
}

function isAssetNode(value: unknown): value is AssetNode {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as AssetNode).assetId === "string" &&
    typeof (value as AssetNode).url === "string"
  );
}

function collectAssetIds(value: unknown, ids: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectAssetIds(item, ids);
    return;
  }
  if (typeof value !== "object" || value === null) return;
  if (isAssetNode(value)) ids.add(value.assetId);
  for (const child of Object.values(value)) collectAssetIds(child, ids);
}

function swapUrls(value: unknown, urls: Map<string, string>): unknown {
  if (Array.isArray(value)) return value.map((item) => swapUrls(item, urls));
  if (typeof value !== "object" || value === null) return value;

  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) out[key] = swapUrls(child, urls);
  if (isAssetNode(value)) {
    const fresh = urls.get(value.assetId);
    if (fresh) out.url = fresh;
  }
  return out;
}

/** Replace every asset-referencing node's `url` with a freshly signed one. */
export async function resolveAssetUrls(config: unknown): Promise<unknown> {
  const ids = new Set<string>();
  collectAssetIds(config, ids);
  if (ids.size === 0) return config;

  ensureConfigured();
  const headers = await authHeaders();

  const urls = new Map<string, string>();
  await Promise.all(
    [...ids].map(async (id) => {
      try {
        const ticket = unwrap(
          await Learn.requestLearnAssetDownload({ path: { id }, body: {}, ...headers }),
        );
        urls.set(id, ticket.url);
      } catch {
        // Asset deleted or inaccessible — leave the stored (dead) URL alone.
      }
    }),
  );

  return swapUrls(config, urls);
}
