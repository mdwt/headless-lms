"use client";

/**
 * The editor's library picker, host side. The editor contract's `pickAsset` is
 * a plain promise — the editor asks for a `{ kind }` and awaits an asset — so
 * this bridges that imperative shape to a declaratively-rendered dialog: a call
 * parks its `resolve` in state, the dialog renders, and selecting (or closing)
 * settles the promise.
 *
 * The returned `url` is a short-lived presigned URL for the editing session;
 * the durable reference is `id`, which the editor persists on the media node
 * (see `editor-upload.ts`).
 */

import { useCallback, useState, type ReactNode } from "react";
import { toast } from "sonner";
import type { EditorMediaKind, UploadedEditorFile } from "@headless-lms/editor";

import { AssetPickerDialog } from "@/app/(dashboard)/media/_components/asset-picker-dialog";
import { getAssetUrlAction } from "@/app/(dashboard)/media/actions";
import type { Asset, AssetKind } from "@/lib/api/types";

/** The API's coarse kinds don't cover audio — it, like any other non-image,
 *  non-video upload, is a `download`. */
function assetKindFor(kind: EditorMediaKind): AssetKind {
  if (kind === "image") return "content";
  if (kind === "video") return "video";
  return "download";
}

interface PickRequest {
  kind: AssetKind;
  resolve: (file: UploadedEditorFile | null) => void;
}

export function useAssetPicker(): {
  pickAsset: (opts: { kind: EditorMediaKind }) => Promise<UploadedEditorFile | null>;
  picker: ReactNode;
} {
  const [request, setRequest] = useState<PickRequest | null>(null);

  const pickAsset = useCallback(
    (opts: { kind: EditorMediaKind }) =>
      new Promise<UploadedEditorFile | null>((resolve) => {
        setRequest({ kind: assetKindFor(opts.kind), resolve });
      }),
    [],
  );

  const settle = useCallback(
    (file: UploadedEditorFile | null) => {
      request?.resolve(file);
      setRequest(null);
    },
    [request],
  );

  const onSelect = useCallback(
    async (asset: Asset) => {
      try {
        const url = await getAssetUrlAction(asset.id, asset.filename);
        settle({
          id: asset.id,
          name: asset.filename,
          size: asset.size,
          type: asset.contentType,
          url,
        });
      } catch {
        toast.error("Couldn't open that file", { description: asset.filename });
        settle(null);
      }
    },
    [settle],
  );

  const picker = (
    <AssetPickerDialog
      open={!!request}
      kind={request?.kind ?? "content"}
      onOpenChange={(open) => {
        if (!open) settle(null);
      }}
      onSelect={onSelect}
    />
  );

  return { pickAsset, picker };
}
