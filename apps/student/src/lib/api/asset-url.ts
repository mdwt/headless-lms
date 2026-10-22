import "server-only";

import { unstable_rethrow } from "next/navigation";
import { Assets } from "@headless-lms/sdk";

import { authHeaders } from "./server-call";
import { ApiError } from "./shared";

export type AssetVia = Parameters<typeof Assets.getAssetDownloadUrl>[0]["via"];

export async function resolveAssetUrl(assetId: string, via: AssetVia): Promise<string | null> {
  try {
    const ticket = await Assets.getAssetDownloadUrl({ id: assetId, via }, await authHeaders());
    return ticket.url;
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}
