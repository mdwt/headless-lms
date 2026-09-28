"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { toast } from "sonner";

import { CourseStatusBadge } from "@/components/status-badge";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/lib/auth/session-context";
import { can } from "@/lib/roles";
import type { Download } from "@/lib/api/types";
import { formatBytes, formatNumber, relativeTime } from "@/lib/format";

import { deleteDownloadAndRedirectAction, setDownloadPublishedAction } from "../../actions";
import { DownloadTabsNav } from "./download-tabs-nav";

// Download header (title, status, stats), the publish/delete actions, and the
// tab nav. Rendered by the download layout above every tab. Unlike the course
// header, publish/delete live here directly instead of a separate
// `*-header-actions` file — this task's shell doesn't need the extra split.
export function DownloadHeader({
  download,
  stats,
}: {
  download: Download;
  /** Composed client-side from the assets + grants resources (not on the row). */
  stats: { assetCount: number; totalSize: number; entitledCount: number };
}) {
  const user = useCurrentUser();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  function onTogglePublish() {
    const next: Download["status"] = download.status === "published" ? "draft" : "published";
    startTransition(async () => {
      try {
        await setDownloadPublishedAction(download.id, next);
        toast.success(next === "published" ? "Download published" : "Moved to draft");
      } catch (e) {
        toast.error("Couldn't update status", { description: (e as Error).message });
        router.refresh();
      }
    });
  }

  function onDelete() {
    startTransition(async () => {
      try {
        // Redirects from inside the action — the client never re-renders this
        // (now-deleted) route, so there's no client-side push here.
        await deleteDownloadAndRedirectAction(download.id);
      } catch (e) {
        toast.error("Couldn't delete download", { description: (e as Error).message });
        setConfirmingDelete(false);
      }
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <Link
        href="/downloads"
        className="inline-flex w-fit items-center gap-1 rounded-md text-sm text-ink-3 outline-none transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        <ChevronLeft className="size-4" />
        Downloads
      </Link>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="text-xl font-semibold tracking-tight text-ink text-balance">
            {download.title}
          </h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-ink-3">
            <CourseStatusBadge status={download.status} />
            <Dot />
            <span className="tabular-nums">{formatNumber(stats.assetCount)} files</span>
            <Dot />
            <span className="tabular-nums">{formatBytes(stats.totalSize)}</span>
            <Dot />
            <span className="tabular-nums">{formatNumber(stats.entitledCount)} entitled</span>
            <Dot />
            <span>Updated {relativeTime(download.updatedAt)}</span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {can.publishDownload(user) && (
            <Button variant="primary" onClick={onTogglePublish} disabled={isPending}>
              {download.status === "published" ? "Unpublish" : "Publish"}
            </Button>
          )}
          {can.deleteDownload(user) && (
            <Button
              variant="destructive"
              onClick={() => setConfirmingDelete(true)}
              disabled={isPending}
            >
              Delete
            </Button>
          )}
        </div>
      </div>

      <DownloadTabsNav downloadId={download.id} />

      <ConfirmDialog
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
        title="Delete download?"
        description={
          <>
            This permanently deletes <span className="font-medium text-ink">{download.title}</span>,
            along with its files. This can&apos;t be undone.
          </>
        }
        confirmLabel="Delete download"
        destructive
        pending={isPending}
        onConfirm={onDelete}
      />
    </div>
  );
}

function Dot() {
  return (
    <span aria-hidden className="text-ink-4">
      ·
    </span>
  );
}
