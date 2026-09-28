"use client";

import { Suspense, useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DataTable } from "@/components/data-table/data-table";
import { useDataTable } from "@/components/data-table/use-data-table";
import { useCurrentUser } from "@/lib/auth/session-context";
import { can } from "@/lib/roles";
import type { BundleRow, ListParams } from "@/lib/api/types";

import { bundlesColumns } from "./bundles-columns";
import { BundleFormDialog } from "./_components/bundle-form-dialog";
import type { LiteContent } from "./_components/content-multi-select";
import { deleteBundleAction } from "./actions";

/** Deep-equal on the small, JSON-safe `ListParams` shape (both sides built by
 *  the same `parseListParams`, so key order is stable). */
function sameParams(a: ListParams, b: ListParams): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// Bundles table (client): rows come in as props; edits go through server actions.
function BundlesTableInner({
  rows,
  total,
  params,
  content,
}: {
  rows: BundleRow[];
  total: number;
  params: ListParams;
  content: LiteContent[];
}) {
  const router = useRouter();
  const user = useCurrentUser();

  const table = useDataTable({ pageSize: params.pageSize, initialSort: params.sort });

  // Navigation in flight: URL is ahead of the rows the server rendered.
  const isStale = !sameParams(table.params, params);

  const [isPending, startTransition] = useTransition();

  // Dialog state: undefined bundle = create, a bundle = edit.
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<BundleRow | undefined>(undefined);

  // Delete confirmation target.
  const [toDelete, setToDelete] = useState<BundleRow | null>(null);

  const canCreate = can.createBundle(user);
  const canEdit = can.editBundle(user);

  const openCreate = useCallback(() => {
    setEditing(undefined);
    setDialogOpen(true);
  }, []);

  const openEdit = useCallback((bundle: BundleRow) => {
    setEditing(bundle);
    setDialogOpen(true);
  }, []);

  const confirmDelete = useCallback(() => {
    if (!toDelete) return;
    const bundle = toDelete;
    startTransition(async () => {
      try {
        await deleteBundleAction(bundle.id);
        toast.success("Bundle deleted");
        setToDelete(null);
      } catch (e) {
        toast.error("Couldn't delete bundle", { description: (e as Error).message });
      }
    });
  }, [toDelete]);

  const columns = useMemo(
    () =>
      bundlesColumns({
        user,
        onEdit: openEdit,
        onDelete: setToDelete,
      }),
    [user, openEdit],
  );

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Bundles"
        subtitle={`${total} ${total === 1 ? "bundle" : "bundles"}`}
        actions={
          canCreate ? (
            <Button variant="primary" onClick={openCreate}>
              New bundle
            </Button>
          ) : undefined
        }
      />

      <DataTable<BundleRow>
        columns={columns}
        rows={rows}
        total={total}
        state={table}
        isLoading={false}
        isFetching={isStale || isPending}
        isError={false}
        refetch={() => router.refresh()}
        getRowId={(b) => b.id}
        searchPlaceholder="Search bundles…"
        onRowClick={canEdit ? openEdit : undefined}
        emptyTitle="No bundles found"
        emptyDescription={
          canCreate ? "Get started by creating your first bundle." : "There are no bundles yet."
        }
        emptyAction={
          canCreate ? (
            <Button variant="secondary" size="sm" onClick={openCreate}>
              New bundle
            </Button>
          ) : undefined
        }
      />

      {/* Opened only via gated triggers (create button / Edit menu item). */}
      <BundleFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        bundle={editing}
        content={content}
      />

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(o) => {
          if (!o) setToDelete(null);
        }}
        title="Delete bundle?"
        description={
          toDelete ? (
            <>
              This permanently deletes <span className="font-medium text-ink">{toDelete.name}</span>
              . The courses and downloads it contains are not affected.
            </>
          ) : null
        }
        confirmLabel="Delete bundle"
        destructive
        pending={isPending}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

export function BundlesTable(props: {
  rows: BundleRow[];
  total: number;
  params: ListParams;
  content: LiteContent[];
}) {
  // `useDataTable` reads `useSearchParams()`, which requires a Suspense boundary.
  return (
    <Suspense fallback={null}>
      <BundlesTableInner {...props} />
    </Suspense>
  );
}
