import { KEYS, nanoid } from "platejs";

import type { UploadedFile } from "../hooks/use-upload-file";

export interface MediaNodeSize {
  height?: number;
  width?: number;
}

/**
 * Node props for a media block backed by a host asset. Shared by the upload
 * path and the library-pick path so both persist the same durable `assetId` —
 * the embedded `url` is a short-lived presign the host re-signs at render time.
 * `assetId` is omitted when the host tracks no asset (local object-URL fallback).
 */
export function mediaNodeProps(
  file: UploadedFile,
  mediaType: string,
  opts: { placeholderId?: string; size?: MediaNodeSize | null } = {},
) {
  return {
    id: nanoid(),
    initialHeight: opts.size?.height,
    initialWidth: opts.size?.width,
    isUpload: true,
    name: mediaType === KEYS.file ? file.name : "",
    placeholderId: opts.placeholderId,
    type: mediaType,
    url: file.url,
    ...(file.id ? { assetId: file.id } : {}),
  };
}
