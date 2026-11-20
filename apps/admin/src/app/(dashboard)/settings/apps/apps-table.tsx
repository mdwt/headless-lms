"use client";

import { Suspense, useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Globe, Plus } from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/data-table/data-table";
import { useDataTable } from "@/components/data-table/use-data-table";
import type { ListParams, OrgApp } from "@/lib/api/types";

import { deleteAppAction } from "./actions";
import { appColumns } from "./apps-columns";
import { hostOf } from "./list-utils";
import { AppFormDialog } from "./_components/app-form-dialog";

function AppsTableInner({
  rows,
  total,
  params,
  apps,
  canEdit,
}: {
  rows: OrgApp[];
  total: number;
  params: ListParams;
  apps: OrgApp[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const table = useDataTable({ pageSize: params.pageSize, initialSort: params.sort });
  const isStale = JSON.stringify(table.params) !== JSON.stringify(params);

  const [isPending, startTransition] = useTransition();
  const [dialog, setDialog] = useState<{ open: boolean; app?: OrgApp }>({ open: false });
  const [deleteTarget, setDeleteTarget] = useState<OrgApp | null>(null);

  const allTaken = apps.some((a) => a.courses) && apps.some((a) => a.community);

  const onCreate = useCallback(() => setDialog({ open: true }), []);
  const onEdit = useCallback((app: OrgApp) => setDialog({ open: true, app }), []);

  const confirmDelete = useCallback(() => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    startTransition(async () => {
      try {
        await deleteAppAction(target.id);
        toast.success("App deleted", { description: target.name });
        setDeleteTarget(null);
      } catch (err) {
        toast.error("Couldn't delete app", { description: (err as Error).message });
      }
    });
  }, [deleteTarget]);

  const columns = useMemo(() => appColumns(onEdit, setDeleteTarget, canEdit), [onEdit, canEdit]);

  return (
    <div className="flex flex-col gap-6">
      <DataTable<OrgApp>
        columns={columns}
        rows={rows}
        total={total}
        state={table}
        isLoading={false}
        isFetching={isStale || isPending}
        isError={false}
        refetch={() => router.refresh()}
        getRowId={(app) => app.id}
        onRowClick={canEdit ? onEdit : undefined}
        searchable={false}
        toolbarActions={
          canEdit ? (
            <Button
              variant="primary"
              size="sm"
              onClick={onCreate}
              disabled={allTaken}
              title={
                allTaken
                  ? "Courses and communities each have an app. Edit an app to free one up."
                  : undefined
              }
            >
              <Plus />
              Create app
            </Button>
          ) : undefined
        }
        emptyIcon={<Globe />}
        emptyTitle="No apps yet"
        emptyDescription="An app is the site your members sign in to. Links in emails and invites open it."
        emptyAction={
          canEdit ? (
            <Button variant="primary" onClick={onCreate}>
              <Plus />
              Create app
            </Button>
          ) : undefined
        }
      />

      {canEdit ? (
        <AppFormDialog
          open={dialog.open}
          onOpenChange={(open) => setDialog((current) => ({ ...current, open }))}
          app={dialog.app}
          apps={apps}
        />
      ) : null}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Delete app?"
        description={
          deleteTarget
            ? `Members can no longer sign in to ${deleteTarget.name} at ${hostOf(deleteTarget.domain)}, and links to it stop working.`
            : ""
        }
        confirmLabel="Delete app"
        destructive
        pending={isPending}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

export function AppsTable(props: {
  rows: OrgApp[];
  total: number;
  params: ListParams;
  apps: OrgApp[];
  canEdit: boolean;
}) {
  return (
    <Suspense fallback={null}>
      <AppsTableInner {...props} />
    </Suspense>
  );
}
