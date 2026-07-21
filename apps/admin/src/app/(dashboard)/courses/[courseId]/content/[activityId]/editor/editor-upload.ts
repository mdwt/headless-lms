/**
 * Editor media uploads, wired to the existing assets API — the same
 * three-step flow the media library uses: POST /api/uploads (mint asset +
 * presigned PUT ticket) → PUT the bytes to storage (XHR, real progress) →
 * POST /api/assets/:id/confirm.
 *
 * The returned URL is a short-lived presigned URL (for immediate display in
 * the editing session). The durable reference is the returned asset `id`,
 * which the editor persists on the media node — pages re-sign fresh URLs for
 * it at render time (see `lib/api/resolve-asset-urls.ts`).
 */

import type { UploadedEditorFile } from "@headless-lms/editor-contract";

import {
  confirmAssetAction,
  getAssetUrlAction,
  requestUploadAction,
} from "@/app/(dashboard)/media/actions";
import { kindForFile, putToStorage } from "@/app/(dashboard)/media/upload-to-storage";

export async function uploadEditorFile(
  file: File,
  opts: { onProgress?: (fraction: number) => void } = {},
): Promise<UploadedEditorFile> {
  const ticket = await requestUploadAction({
    filename: file.name,
    contentType: file.type || "application/octet-stream",
    kind: kindForFile(file),
  });

  await putToStorage(ticket.uploadUrl, ticket.headers, file, opts.onProgress);
  await confirmAssetAction(ticket.asset.id);

  const url = await getAssetUrlAction(ticket.asset.id, file.name);

  return {
    id: ticket.asset.id,
    name: file.name,
    size: file.size,
    type: file.type,
    url,
  };
}
