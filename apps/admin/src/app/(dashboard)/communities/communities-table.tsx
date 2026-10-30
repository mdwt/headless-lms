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
import type { Community, ListParams } from "@/lib/api/types";

import { communitiesColumns } from "./communities-columns";
import { CommunityFormDialog } from "./_components/community-form-dialog";
import { deleteCommunityAction, setCommunityPublishedAction } from "./actions";

function sameParams(a: ListParams, b: ListParams): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function CommunitiesTableInner({
  rows,
  total,
  params,
}: {
  rows: Community[];
  total: number;
  params: ListParams;
}) {
  const router = useRouter();
  const user = useCurrentUser();
  const table = useDataTable({ pageSize: params.pageSize, initialSort: params.sort });
  const isStale = !sameParams(table.params, params);

  const [optimisticRows, applyOptimistic] = useOptimistic(
    rows,
    (state: Community[], patch: { id: string; status: Community["status"] }) =>
      state.map((c) => (c.id === patch.id ? { ...c, status: patch.status } : c)),
  );
  const [isPending, startTransition] = useTransition();
  const [creating, setCreating] = useState(false);
  const [toDelete, setToDelete] = useState<Community | null>(null);

  const canCreate = can.manageCommunities(user);

  const open = useCallback(
    (community: Community) => router.push(`/communities/${community.id}`),
    [router],
  );

  const onTogglePublish = useCallback(
    (community: Community) => {
      const next: Community["status"] = community.status === "published" ? "draft" : "published";
      startTransition(async () => {
        applyOptimistic({ id: community.id, status: next });
        try {
          await setCommunityPublishedAction(community.id, next);
          toast.success(next === "published" ? "Community published" : "Moved to draft");
        } catch (e) {
          toast.error("Couldn't update status", { description: (e as Error).message });
        }
      });
    },
    [applyOptimistic],
  );

  const confirmDelete = useCallback(() => {
    if (!toDelete) return;
    const community = toDelete;
    startTransition(async () => {
      try {
        await deleteCommunityAction(community.id);
        toast.success("Community deleted");
        setToDelete(null);
      } catch (e) {
        toast.error("Couldn't delete community", { description: (e as Error).message });
      }
    });
  }, [toDelete]);

  const columns = useMemo(
    () => communitiesColumns({ user, onView: open, onTogglePublish, onDelete: setToDelete }),
    [user, open, onTogglePublish],
  );

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Communities"
        subtitle={`${total} ${total === 1 ? "community" : "communities"}`}
        actions={
          canCreate ? (
            <Button variant="primary" onClick={() => setCreating(true)}>
              New community
            </Button>
          ) : undefined
        }
      />

      <DataTable<Community>
        columns={columns}
        rows={optimisticRows}
        total={total}
        state={table}
        isLoading={false}
        isFetching={isStale || isPending}
        isError={false}
        refetch={() => router.refresh()}
        getRowId={(c) => c.id}
        searchPlaceholder="Search communities…"
        onRowClick={open}
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
        emptyTitle="No communities found"
        emptyDescription={
          canCreate
            ? "Create a community, then add the spaces members post in."
            : "There are no communities yet."
        }
        emptyAction={
          canCreate ? (
            <Button variant="secondary" size="sm" onClick={() => setCreating(true)}>
              New community
            </Button>
          ) : undefined
        }
      />

      <CommunityFormDialog open={creating} onOpenChange={setCreating} />

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(o) => {
          if (!o) setToDelete(null);
        }}
        title="Delete community?"
        description={
          toDelete ? (
            <>
              This permanently deletes{" "}
              <span className="font-medium text-ink">{toDelete.title}</span>, its spaces, and
              everything members posted in them. This can&apos;t be undone.
            </>
          ) : null
        }
        confirmLabel="Delete community"
        destructive
        pending={isPending}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

export function CommunitiesTable(props: { rows: Community[]; total: number; params: ListParams }) {
  return (
    <Suspense fallback={null}>
      <CommunitiesTableInner {...props} />
    </Suspense>
  );
}
