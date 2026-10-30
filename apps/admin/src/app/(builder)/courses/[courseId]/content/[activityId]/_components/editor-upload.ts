/**
 * Editor media uploads, wired to the existing assets API — the same
 * three-step flow the media library uses: POST /api/uploads (mint asset +
 * presigned PUT ticket) → PUT the bytes to storage (XHR, real progress) →
 * POST /api/assets/:id/confirm.
 *
 * The returned URL is the staff library URL the confirm response carries, for
 * display in the editing session. The durable reference is the returned asset
 * `id`, which the editor persists on the media node; later reads of the
 * activity serve its URL in `assetUrls`.
 */

import type { UploadedEditorFile } from "@headless-lms/editor";

import { confirmAssetAction, requestUploadAction } from "@/app/(dashboard)/media/actions";
import { putToStorage } from "@/app/(dashboard)/media/upload-to-storage";

export async function uploadEditorFile(
  file: File,
  opts: { onProgress?: (fraction: number) => void } = {},
): Promise<UploadedEditorFile> {
  const ticket = await requestUploadAction({
    filename: file.name,
    contentType: file.type || "application/octet-stream",
  });

  await putToStorage(ticket.uploadUrl, ticket.headers, file, opts.onProgress);
  const asset = await confirmAssetAction(ticket.asset.id);
  if (!asset.url) {
    throw new Error(`${file.name} has not finished uploading`);
  }

  return {
    id: asset.id,
    name: file.name,
    size: file.size,
    type: file.type,
    url: asset.url,
  };
}
