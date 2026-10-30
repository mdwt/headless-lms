"use client";

import { Copy, Download, FileText, Trash2 } from "lucide-react";
import { toast } from "sonner";

import type { Asset } from "@/lib/api/types";
import { formatBytes, formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

function isImage(a: Asset) {
  return a.contentType.startsWith("image/");
}
function isVideo(a: Asset) {
  return a.contentType.startsWith("video/");
}

/** Modal preview: large media, metadata, and serve/download/delete actions. */
export function AssetPreviewDialog({
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
  const url = asset?.url ?? null;
  const downloadUrl = asset?.downloadUrl ?? null;

  async function copyLink() {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    toast.success("Link copied", { description: "Opens only for signed-in staff." });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="truncate">{asset?.filename ?? "Media"}</DialogTitle>
          <DialogDescription>
            {asset ? `${asset.contentType} · ${formatBytes(asset.size)}` : null}
          </DialogDescription>
        </DialogHeader>

        <div className="-mr-1 flex min-h-0 flex-col gap-5 overflow-y-auto pr-1">
          {asset && (
            <>
              <div className="grid min-h-56 place-items-center overflow-hidden rounded-lg bg-surface-2 p-2 outline-1 -outline-offset-1 outline-ink/5">
                {isImage(asset) && url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={url}
                    alt=""
                    className="max-h-[45dvh] w-auto rounded-md object-contain"
                  />
                ) : isVideo(asset) && url ? (
                  <video src={url} controls className="max-h-[45dvh] w-full rounded-md" />
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
        </div>

        <DialogFooter className="sm:justify-between">
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
            <Button variant="primary" size="sm" asChild={!!downloadUrl} disabled={!downloadUrl}>
              {downloadUrl ? (
                <a href={downloadUrl} target="_blank" rel="noreferrer" download={asset?.filename}>
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
