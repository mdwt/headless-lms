/**
 * Editor media uploads, wired to the existing assets API — the same
 * three-step flow the media library uses: POST /api/uploads (mint asset +
 * presigned PUT ticket) → PUT the bytes to storage (XHR, real progress) →
 * POST /api/assets/:id/confirm.
 *
 * The URL embedded into content is the STABLE serve route
 * (`/api/assets/:id/file`), which redirects to a fresh presigned URL on every
 * request — never the presigned URL itself, which expires within minutes.
 */

import type { UploadedEditorFile } from "@headless-lms/editor-contract";

import { confirmAssetAction, requestUploadAction } from "@/app/(dashboard)/media/actions";
import { kindForFile, putToStorage } from "@/app/(dashboard)/media/upload-to-storage";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

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

  return {
    id: ticket.asset.id,
    name: file.name,
    size: file.size,
    type: file.type,
    url: `${API_URL}/api/assets/${ticket.asset.id}/file`,
  };
}
