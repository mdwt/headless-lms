/**
 * Client-side upload helpers. The direct-to-storage PUT is irreducibly
 * browser-only — it needs XHR to surface real upload progress and it talks to
 * object storage directly (not through the API). It runs between the two
 * Server Actions in `actions.ts` (`requestUploadAction` → PUT → `confirmAssetAction`).
 *
 * Ported out of `lib/api/sdk.ts` so the media island no longer depends on the
 * react-query client at all.
 */

import { ApiError } from "@/lib/api/http";
import type { AssetKind } from "@/lib/api/types";

/** Map a browser File to the API's coarse asset kind. */
export function kindForFile(file: File): AssetKind {
  if (file.type.startsWith("image/")) return "content";
  if (file.type.startsWith("video/")) return "video";
  return "download";
}

/**
 * PUT the file straight to object storage using the presigned URL + headers
 * from the upload ticket. Uses XHR so the caller can show real upload progress.
 */
export function putToStorage(
  url: string,
  headers: Record<string, string>,
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new ApiError(xhr.status, "Upload to storage failed"));
    };
    xhr.onerror = () =>
      reject(new ApiError(0, "Couldn't reach storage (check the bucket's CORS configuration)"));
    xhr.send(file);
  });
}
