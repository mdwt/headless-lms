"use client";

import { Suspense, useCallback, useMemo, useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DataTable } from "@/components/data-table/data-table";
import { useDataTable } from "@/components/data-table/use-data-table";
import { useCurrentUser } from "@/lib/auth/session-context";
import { can } from "@/lib/roles";
import type { Download, ListParams } from "@/lib/api/types";

import { downloadsColumns } from "./downloads-columns";
import { DownloadFormDialog } from "./_components/download-form-dialog";
import { setDownloadPublishedAction, deleteDownloadAction } from "./actions";

/** Deep-equal on the small, JSON-safe `ListParams` shape (both sides built by
 *  the same `parseListParams`, so key order is stable). */
function sameParams(a: ListParams, b: ListParams): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// Downloads table (client): rows come in as props; edits go through server actions.
function DownloadsTableInner({
  rows,
  total,
  params,
}: {
  rows: Download[];
  total: number;
  params: ListParams;
}) {
  const router = useRouter();
  const user = useCurrentUser();

  const table = useDataTable({ pageSize: params.pageSize, initialSort: params.sort });

  // Navigation in flight: URL is ahead of the rows the server rendered.
  const isStale = !sameParams(table.params, params);

  // Optimistic publish flips. Base resets to `rows` whenever the RSC re-renders,
  // so the optimistic value is discarded once the real (revalidated) row lands.
  const [optimisticRows, applyOptimistic] = useOptimistic(
    rows,
    (state: Download[], patch: { id: string; status: Download["status"] }) =>
      state.map((d) => (d.id === patch.id ? { ...d, status: patch.status } : d)),
  );

  const [isPending, startTransition] = useTransition();

  // Dialog state: undefined download = create, a download = edit.
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Download | undefined>(undefined);

  // Delete confirmation target.
  const [toDelete, setToDelete] = useState<Download | null>(null);

  const canCreate = can.createDownload(user);

  const openCreate = useCallback(() => {
    setEditing(undefined);
    setDialogOpen(true);
  }, []);

  const openEdit = useCallback((download: Download) => {
    setEditing(download);
    setDialogOpen(true);
  }, []);

  const goToDetail = useCallback(
    (download: Download) => router.push(`/downloads/${download.id}`),
    [router],
  );

  const onTogglePublish = useCallback(
    (download: Download) => {
      const next: Download["status"] = download.status === "published" ? "draft" : "published";
      startTransition(async () => {
        applyOptimistic({ id: download.id, status: next });
        try {
          await setDownloadPublishedAction(download.id, next);
          toast.success(next === "published" ? "Download published" : "Moved to draft");
        } catch (e) {
          toast.error("Couldn't update status", { description: (e as Error).message });
        }
      });
    },
    [applyOptimistic],
  );

  const confirmDelete = useCallback(() => {
    if (!toDelete) return;
    const download = toDelete;
    startTransition(async () => {
      try {
        await deleteDownloadAction(download.id);
        toast.success("Download deleted");
        setToDelete(null);
      } catch (e) {
        toast.error("Couldn't delete download", { description: (e as Error).message });
      }
    });
  }, [toDelete]);

  const columns = useMemo(
    () =>
      downloadsColumns({
        user,
        onView: goToDetail,
        onEdit: openEdit,
        onTogglePublish,
        onDelete: setToDelete,
      }),
    [user, goToDetail, openEdit, onTogglePublish],
  );

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Downloads"
        subtitle={`${total} ${total === 1 ? "download" : "downloads"}`}
        actions={
          canCreate ? (
            <Button variant="primary" onClick={openCreate}>
              New download
            </Button>
          ) : undefined
        }
      />

      <DataTable<Download>
        columns={columns}
        rows={optimisticRows}
        total={total}
        state={table}
        isLoading={false}
        isFetching={isStale || isPending}
        isError={false}
        refetch={() => router.refresh()}
        getRowId={(d) => d.id}
        searchPlaceholder="Search downloads…"
        onRowClick={goToDetail}
        facets={[
          {
            columnId: "status",
            title: "Status",
            options: [
              { label: "Draft", value: "draft" },
              { label: "Published", value: "published" },
            ],
          },
        ]}
        emptyTitle="No downloads found"
        emptyDescription={
          canCreate ? "Get started by creating your first download." : "There are no downloads yet."
        }
        emptyAction={
          canCreate ? (
            <Button variant="secondary" size="sm" onClick={openCreate}>
              New download
            </Button>
          ) : undefined
        }
      />

      {/* Opened only via gated triggers (create button / Edit menu item). */}
      <DownloadFormDialog open={dialogOpen} onOpenChange={setDialogOpen} download={editing} />

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(o) => {
          if (!o) setToDelete(null);
        }}
        title="Delete download?"
        description={
          toDelete ? (
            <>
              This permanently deletes{" "}
              <span className="font-medium text-ink">{toDelete.title}</span>, along with its files.
              This can&apos;t be undone.
            </>
          ) : null
        }
        confirmLabel="Delete download"
        destructive
        pending={isPending}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

export function DownloadsTable(props: { rows: Download[]; total: number; params: ListParams }) {
  // `useDataTable` reads `useSearchParams()`, which requires a Suspense boundary.
  return (
    <Suspense fallback={null}>
      <DownloadsTableInner {...props} />
    </Suspense>
  );
}
