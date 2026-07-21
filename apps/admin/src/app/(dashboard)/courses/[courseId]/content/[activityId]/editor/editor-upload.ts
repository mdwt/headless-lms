/**
 * Editor media uploads, wired to the existing assets API — the same
 * three-step flow the media library uses: POST /api/uploads (mint asset +
 * presigned PUT ticket) → PUT the bytes to storage (XHR, real progress) →
 * POST /api/assets/:id/confirm. The returned URL is a brokered download URL
 * for the freshly-uploaded asset.
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
