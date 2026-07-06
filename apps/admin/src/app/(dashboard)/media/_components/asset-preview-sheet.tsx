"use client";

import * as React from "react";
import { Copy, Download, FileText, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import type { Asset } from "@/lib/api/types";
import { formatBytes, formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { getAssetUrlAction } from "../actions";

function isImage(a: Asset) {
  return a.contentType.startsWith("image/");
}
function isVideo(a: Asset) {
  return a.contentType.startsWith("video/");
}

/** Slide-over preview: large media, metadata, and serve/download/delete actions. */
export function AssetPreviewSheet({
  asset,
  open,
  onOpenChange,
  onDelete,
}: {
  asset: Asset | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete: (asset: Asset) => void;
}) {
  // Presigned URLs are short-lived, so fetch on demand when the sheet opens
  // (via a Server Action) rather than caching long-term.
  const [url, setUrl] = React.useState<string | null>(null);
  const [isLoading, startTransition] = React.useTransition();
  const assetId = asset?.id;

  React.useEffect(() => {
    if (!open || !assetId) return;
    let cancelled = false;
    startTransition(async () => {
      // Clear any prior asset's URL and resolve this one — all inside the
      // transition so no state is set synchronously in the effect body.
      setUrl(null);
      try {
        const next = await getAssetUrlAction(assetId);
        if (!cancelled) setUrl(next);
      } catch {
        if (!cancelled) setUrl(null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, assetId]);

  async function copyLink() {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    toast.success("Link copied", { description: "Short-lived presigned URL." });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="truncate">{asset?.filename ?? "Media"}</SheetTitle>
          <SheetDescription>
            {asset ? `${asset.contentType} · ${formatBytes(asset.size)}` : null}
          </SheetDescription>
        </SheetHeader>

        <SheetBody className="flex flex-col gap-5">
          {asset && (
            <>
              <div className="grid min-h-56 place-items-center overflow-hidden rounded-lg bg-surface-2 p-2 outline-1 -outline-offset-1 outline-ink/5">
                {isLoading ? (
                  <Loader2 className="size-5 animate-spin text-ink-4" />
                ) : isImage(asset) && url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={url} alt="" className="max-h-[60vh] w-auto rounded-md object-contain" />
                ) : isVideo(asset) && url ? (
                  <video src={url} controls className="max-h-[60vh] w-full rounded-md" />
                ) : (
                  <div className="flex flex-col items-center gap-2 py-10 text-ink-3">
                    <FileText className="size-8" />
                    <p className="text-sm">No inline preview — download to view.</p>
                  </div>
                )}
              </div>

              <dl className="grid grid-cols-[8rem_1fr] gap-x-4 gap-y-2.5 text-sm">
                <dt className="text-ink-3">Status</dt>
                <dd>
                  <Badge variant={asset.status === "ready" ? "success" : "warning"}>
                    {asset.status === "ready" ? "Ready" : "Processing"}
                  </Badge>
                </dd>
                <dt className="text-ink-3">Type</dt>
                <dd className="text-ink-2">{asset.contentType}</dd>
                <dt className="text-ink-3">Size</dt>
                <dd className="text-ink-2">{formatBytes(asset.size)}</dd>
                <dt className="text-ink-3">Uploaded</dt>
                <dd className="text-ink-2">{formatDate(asset.createdAt)}</dd>
                <dt className="text-ink-3">Asset ID</dt>
                <dd className="truncate font-mono text-xs text-ink-3">{asset.id}</dd>
              </dl>
            </>
          )}
        </SheetBody>

        <SheetFooter className="justify-between">
          {asset && (
            <Button variant="destructive" size="sm" onClick={() => onDelete(asset)}>
              <Trash2 />
              Delete
            </Button>
          )}
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={copyLink} disabled={!url}>
              <Copy />
              Copy link
            </Button>
            <Button variant="primary" size="sm" asChild={!!url} disabled={!url}>
              {url ? (
                <a href={url} target="_blank" rel="noreferrer" download={asset?.filename}>
                  <Download />
                  Download
                </a>
              ) : (
                <span>
                  <Download />
                  Download
                </span>
              )}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
