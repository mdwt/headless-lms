"use client";

import * as React from "react";
import { Copy, FileText, Film, ImageIcon, Loader2, Trash2 } from "lucide-react";

import type { Asset } from "@/lib/api/types";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getAssetUrlAction } from "../actions";

function isImage(a: Asset) {
  return a.contentType.startsWith("image/");
}
function isVideo(a: Asset) {
  return a.contentType.startsWith("video/");
}

function kindMeta(a: Asset): { label: string; icon: React.ReactNode } {
  if (isImage(a)) return { label: "Image", icon: <ImageIcon /> };
  if (isVideo(a) || a.kind === "video") return { label: "Video", icon: <Film /> };
  return { label: "File", icon: <FileText /> };
}

/** A single tile in the media grid: thumbnail, name, meta, and hover actions. */
export function AssetCard({
  asset,
  onPreview,
  onCopyLink,
  onDelete,
}: {
  asset: Asset;
  onPreview: (asset: Asset) => void;
  onCopyLink: (asset: Asset) => void;
  onDelete: (asset: Asset) => void;
}) {
  const previewable = (isImage(asset) || isVideo(asset)) && asset.status === "ready";

  // Lazily broker a short-lived presigned thumbnail URL via a Server Action when
  // this tile is previewable. Not cached long-term — these URLs expire quickly.
  const [url, setUrl] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!previewable) return;
    let cancelled = false;
    void getAssetUrlAction(asset.id)
      .then((u) => {
        if (!cancelled) setUrl(u);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [previewable, asset.id]);

  const meta = kindMeta(asset);
  const pending = asset.status === "pending";

  return (
    <div className="group relative flex flex-col">
      <button
        type="button"
        onClick={() => onPreview(asset)}
        className="relative aspect-[4/3] w-full overflow-hidden rounded-lg bg-surface-2 outline-1 -outline-offset-1 outline-ink/5 transition-colors hover:outline-ink/10 focus-visible:outline-2 focus-visible:outline-brand"
        aria-label={`Preview ${asset.filename}`}
      >
        {pending ? (
          <span className="absolute inset-0 grid place-items-center text-ink-4">
            <Loader2 className="size-5 animate-spin" />
          </span>
        ) : isImage(asset) && url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="size-full object-cover" />
        ) : isVideo(asset) && url ? (
          <video src={url} preload="metadata" muted className="size-full object-cover" />
        ) : isImage(asset) ? (
          <span className="skeleton absolute inset-0" />
        ) : (
          <span className="absolute inset-0 grid place-items-center text-ink-4">
            <span className="[&>svg]:size-7">{meta.icon}</span>
          </span>
        )}

        {/* hover scrim + actions */}
        <span className="pointer-events-none absolute inset-0 bg-ink/0 transition-colors group-hover:bg-ink/10" />
      </button>

      {/* floating actions */}
      <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <CardAction label="Copy link" onClick={() => onCopyLink(asset)} disabled={pending}>
          <Copy />
        </CardAction>
        <CardAction label="Delete" variant="danger" onClick={() => onDelete(asset)}>
          <Trash2 />
        </CardAction>
      </div>

      <div className="mt-2 flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <p className="truncate text-sm font-medium text-ink" title={asset.filename}>
            {asset.filename}
          </p>
          <p className="text-xs text-ink-4">{pending ? "Processing…" : formatBytes(asset.size)}</p>
        </div>
        <Badge variant="neutral" className="shrink-0 pl-1.5 [&>svg]:text-ink-4">
          {meta.icon}
          {meta.label}
        </Badge>
      </div>
    </div>
  );
}

function CardAction({
  label,
  onClick,
  disabled,
  variant = "default",
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: "default" | "danger";
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
          className={cn(
            "grid size-7 place-items-center rounded-md bg-surface/90 text-ink-2 shadow-sm ring-1 ring-ink/5 backdrop-blur transition-colors outline-none",
            "hover:bg-surface focus-visible:ring-2 focus-visible:ring-brand/40 disabled:opacity-40",
            "[&>svg]:size-3.5",
            variant === "danger" && "hover:text-danger",
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
