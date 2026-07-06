"use client";

import * as React from "react";
import { CheckCircle2, Loader2, Search, Upload, UploadCloud, X } from "lucide-react";
import { toast } from "sonner";

import { ApiError } from "@/lib/api/http";
import type { Asset, AssetKind, ListParams } from "@/lib/api/types";
import { useDataTable } from "@/components/data-table/use-data-table";
import { cn } from "@/lib/utils";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Pagination } from "@/components/data-table/pagination";
import { AssetCard } from "./_components/asset-card";
import { AssetPreviewSheet } from "./_components/asset-preview-sheet";
import {
  confirmAssetAction,
  deleteAssetAction,
  getAssetUrlAction,
  requestUploadAction,
} from "./actions";
import { kindForFile, putToStorage } from "./upload-to-storage";

const KIND_TABS: { label: string; value: "all" | AssetKind }[] = [
  { label: "All", value: "all" },
  { label: "Images", value: "content" },
  { label: "Video", value: "video" },
  { label: "Files", value: "download" },
];

interface UploadItem {
  id: string;
  name: string;
  progress: number;
  status: "uploading" | "done" | "error";
}

/** Deep-equal on the small, JSON-safe `ListParams` shape (both sides built by
 *  the same `parseListParams`, so key order is stable). */
function sameParams(a: ListParams, b: ListParams): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Client island for the media library (option 2). Rows arrive as PROPS from the
 * Server Component — no `useAssets`, no client query cache. `useDataTable` still
 * owns the URL state (page/pageSize/search/kind filter), so changing it re-runs
 * the RSC and new rows stream back down. The "dim while loading" react-query
 * gave via `isFetching` is derived from staleness: the URL (`state.params`) has
 * moved ahead of the server-rendered `params` until the RSC catches up.
 *
 * The browser-only flows stay client-side and drive `useTransition`/`useState`:
 *  - upload: `requestUploadAction` (presign) → XHR PUT with progress
 *    (`putToStorage`) → `confirmAssetAction` (revalidate);
 *  - delete: `deleteAssetAction`;
 *  - presigned preview/copy-link/download URLs: `getAssetUrlAction`, fetched on
 *    demand (see AssetCard / AssetPreviewSheet).
 */
function MediaViewInner({
  rows,
  total,
  params,
}: {
  rows: Asset[];
  total: number;
  params: ListParams;
}) {
  const state = useDataTable({ pageSize: params.pageSize, initialSort: params.sort });

  // Navigation in flight: URL is ahead of the rows the server rendered.
  const isStale = !sameParams(state.params, params);

  const [isPending, startTransition] = React.useTransition();

  const [preview, setPreview] = React.useState<Asset | null>(null);
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const [toDelete, setToDelete] = React.useState<Asset | null>(null);
  const [uploads, setUploads] = React.useState<UploadItem[]>([]);
  const [dragging, setDragging] = React.useState(false);

  const inputRef = React.useRef<HTMLInputElement>(null);
  const seq = React.useRef(0);

  const activeKind =
    (state.columnFilters.find((f) => f.id === "kind")?.value as string[] | undefined)?.[0] ?? "all";

  function setKind(value: "all" | AssetKind) {
    state.setColumnFilters(value === "all" ? [] : [{ id: "kind", value: [value] }]);
  }

  function patchUpload(id: string, patch: Partial<UploadItem>) {
    setUploads((list) => list.map((u) => (u.id === id ? { ...u, ...patch } : u)));
  }

  function handleFiles(files: FileList | File[] | null) {
    if (!files) return;
    for (const file of Array.from(files)) {
      const id = `u${seq.current++}`;
      setUploads((list) => [...list, { id, name: file.name, progress: 0, status: "uploading" }]);
      // Presign (server) → PUT bytes straight to storage over XHR (browser,
      // with progress) → confirm (server, revalidates the list).
      startTransition(async () => {
        try {
          const ticket = await requestUploadAction({
            filename: file.name,
            contentType: file.type || "application/octet-stream",
            kind: kindForFile(file),
          });
          await putToStorage(ticket.uploadUrl, ticket.headers ?? {}, file, (f) =>
            patchUpload(id, { progress: f }),
          );
          await confirmAssetAction(ticket.asset.id);
          patchUpload(id, { progress: 1, status: "done" });
          toast.success("Uploaded", { description: file.name });
          window.setTimeout(() => setUploads((l) => l.filter((u) => u.id !== id)), 2500);
        } catch (e) {
          patchUpload(id, { status: "error" });
          toast.error("Upload failed", {
            description: e instanceof ApiError ? e.message : file.name,
          });
        }
      });
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  }

  const confirmDelete = React.useCallback(() => {
    if (!toDelete) return;
    const asset = toDelete;
    startTransition(async () => {
      try {
        await deleteAssetAction(asset.id);
        toast.success("File deleted");
        setToDelete(null);
      } catch (e) {
        toast.error("Couldn't delete file", { description: (e as Error).message });
      }
    });
  }, [toDelete]);

  const hasFilters = state.search.length > 0 || activeKind !== "all";
  const showGrid = rows.length > 0;

  return (
    <div
      className="flex flex-col gap-6"
      onDragOver={(e) => {
        e.preventDefault();
        if (!dragging) setDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false);
      }}
      onDrop={onDrop}
    >
      <input
        ref={inputRef}
        type="file"
        name="files"
        multiple
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />

      <PageHeader
        title="Media library"
        description="Upload and manage the images, video, and files used across your courses."
        actions={
          <Button variant="primary" onClick={() => inputRef.current?.click()}>
            <Upload />
            Upload
          </Button>
        }
      />

      {/* toolbar: search + kind tabs */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-4" />
          <Input
            value={state.search}
            onChange={(e) => state.setSearch(e.target.value)}
            placeholder="Search files…"
            aria-label="Search media"
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-line bg-surface-2 p-0.5">
          {KIND_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setKind(tab.value)}
              aria-pressed={activeKind === tab.value}
              className={cn(
                "rounded-md px-3 py-1 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                activeKind === tab.value
                  ? "bg-surface text-ink shadow-sm ring-1 ring-ink/5"
                  : "text-ink-3 hover:text-ink",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* content */}
      {showGrid ? (
        <>
          <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {rows.map((asset) => (
              <AssetCard
                key={asset.id}
                asset={asset}
                onPreview={(a) => {
                  setPreview(a);
                  setPreviewOpen(true);
                }}
                onCopyLink={async (a) => {
                  try {
                    const url = await getAssetUrlAction(a.id);
                    await navigator.clipboard.writeText(url);
                    toast.success("Link copied");
                  } catch {
                    toast.error("Couldn't copy link");
                  }
                }}
                onDelete={(a) => setToDelete(a)}
              />
            ))}
          </div>
          <Pagination
            page={state.page}
            pageSize={state.pageSize}
            total={total}
            onPageChange={state.setPage}
            onPageSizeChange={state.setPageSize}
            isFetching={isStale || isPending}
          />
        </>
      ) : hasFilters ? (
        <StatePanel title="No matching media" description="Try a different search or filter." />
      ) : (
        <Dropzone onBrowse={() => inputRef.current?.click()} />
      )}

      {/* full-page drag overlay */}
      {dragging && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30 backdrop-blur-[1px]">
          <div className="flex flex-col items-center gap-2 rounded-card border-2 border-dashed border-surface/60 bg-surface px-10 py-8 text-ink shadow-lg">
            <UploadCloud className="size-7 text-brand" />
            <p className="font-medium">Drop to upload</p>
          </div>
        </div>
      )}

      <UploadTray
        uploads={uploads}
        onDismiss={(id) => setUploads((l) => l.filter((u) => u.id !== id))}
      />

      <AssetPreviewSheet
        asset={preview}
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        onDelete={(a) => {
          setPreviewOpen(false);
          setToDelete(a);
        }}
      />

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Delete this file?"
        description={
          <>
            <span className="font-medium text-ink">{toDelete?.filename}</span> will be permanently
            removed from storage. Anything referencing it will break.
          </>
        }
        confirmLabel="Delete file"
        pending={isPending}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

export function MediaView(props: { rows: Asset[]; total: number; params: ListParams }) {
  // `useDataTable` reads `useSearchParams()`, which requires a Suspense boundary.
  return (
    <React.Suspense fallback={null}>
      <MediaViewInner {...props} />
    </React.Suspense>
  );
}

function Dropzone({ onBrowse }: { onBrowse: () => void }) {
  return (
    <button
      type="button"
      onClick={onBrowse}
      className="flex flex-col items-center justify-center gap-3 rounded-card border-2 border-dashed border-line-strong bg-surface px-6 py-16 text-center transition-colors hover:border-brand/40 hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring/40 outline-none"
    >
      <span className="grid size-11 place-items-center rounded-full bg-surface-2 text-ink-3">
        <UploadCloud className="size-5" />
      </span>
      <span className="flex flex-col gap-1">
        <span className="font-medium text-ink">Upload your first file</span>
        <span className="text-sm text-ink-3">Drag and drop here, or click to browse.</span>
      </span>
    </button>
  );
}

function UploadTray({
  uploads,
  onDismiss,
}: {
  uploads: UploadItem[];
  onDismiss: (id: string) => void;
}) {
  if (uploads.length === 0) return null;
  return (
    <div className="fixed right-4 bottom-4 z-40 w-72 overflow-hidden rounded-lg border border-line bg-surface shadow-[0_16px_40px_-16px_rgba(24,24,27,0.3)]">
      <div className="border-b border-line px-3 py-2 text-xs font-medium text-ink-3">
        Uploading {uploads.filter((u) => u.status === "uploading").length || ""}
      </div>
      <ul role="list" className="max-h-64 divide-y divide-line overflow-y-auto">
        {uploads.map((u) => (
          <li key={u.id} className="flex items-center gap-2.5 px-3 py-2">
            <span className="shrink-0">
              {u.status === "done" ? (
                <CheckCircle2 className="size-4 text-success" />
              ) : u.status === "error" ? (
                <X className="size-4 text-danger" />
              ) : (
                <Loader2 className="size-4 animate-spin text-ink-4" />
              )}
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <p className="truncate text-sm text-ink">{u.name}</p>
              {u.status === "uploading" && (
                <span className="h-1 overflow-hidden rounded-full bg-surface-3">
                  <span
                    className="block h-full rounded-full bg-brand transition-[width] duration-200"
                    style={{ width: `${Math.round(u.progress * 100)}%` }}
                  />
                </span>
              )}
              {u.status === "error" && <p className="text-xs text-danger">Failed</p>}
            </div>
            {u.status !== "uploading" && (
              <button
                type="button"
                onClick={() => onDismiss(u.id)}
                aria-label="Dismiss"
                className="grid size-5 shrink-0 place-items-center rounded text-ink-4 hover:text-ink"
              >
                <X className="size-3.5" />
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatePanel({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card border border-line bg-surface px-6 py-16 text-center">
      <div className="flex flex-col gap-1">
        <p className="font-medium text-ink">{title}</p>
        <p className="text-sm text-ink-3">{description}</p>
      </div>
      {action}
    </div>
  );
}
