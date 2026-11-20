"use client";

import { Suspense, useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Globe, Plus } from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DataTable } from "@/components/data-table/data-table";
import { useDataTable } from "@/components/data-table/use-data-table";
import { usePermissions } from "@/lib/auth/permissions-context";
import type { ListParams, OrgApp } from "@/lib/api/types";

import { deleteAppAction } from "./actions";
import { appColumns } from "./apps-columns";
import { hostOf } from "./list-utils";
import { AppFormDialog } from "./_components/app-form-dialog";

function noRoomReason(apps: OrgApp[]): string | null {
  const courses = apps.find((app) => app.courses);
  const community = apps.find((app) => app.community);
  if (!courses || !community) return null;
  return courses.id === community.id
    ? `${courses.name} has both courses and communities. To create a second app, edit it and untick one.`
    : "Courses and communities each have an app. An organization has no more than these two.";
}

function AppsTableInner({
  rows,
  total,
  params,
  apps,
}: {
  rows: OrgApp[];
  total: number;
  params: ListParams;
  apps: OrgApp[];
}) {
  const router = useRouter();
  const canEdit = usePermissions().has("organizations:write");
  const table = useDataTable({ pageSize: params.pageSize, initialSort: params.sort });
  const isStale = JSON.stringify(table.params) !== JSON.stringify(params);

  const [isPending, startTransition] = useTransition();
  const [dialog, setDialog] = useState<{ open: boolean; app?: OrgApp }>({ open: false });
  const [deleteTarget, setDeleteTarget] = useState<OrgApp | null>(null);

  const noRoom = noRoomReason(apps);

  const onCreate = useCallback(() => setDialog({ open: true }), []);
  const onEdit = useCallback((app: OrgApp) => setDialog({ open: true, app }), []);

  const confirmDelete = useCallback(() => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    startTransition(async () => {
      try {
        const refusal = await deleteAppAction(target.id);
        if (refusal) {
          toast.error("Couldn't delete app", { description: refusal.refused });
        } else {
          toast.success("App deleted", { description: target.name });
        }
        setDeleteTarget(null);
        router.refresh();
      } catch (err) {
        toast.error("Couldn't delete app", { description: (err as Error).message });
      }
    });
  }, [deleteTarget, router]);

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
          !canEdit ? undefined : noRoom ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  tabIndex={0}
                  className="inline-flex rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                >
                  <Button variant="primary" size="sm" disabled>
                    <Plus />
                    Create app
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-64 text-pretty">{noRoom}</TooltipContent>
            </Tooltip>
          ) : (
            <Button variant="primary" size="sm" onClick={onCreate}>
              <Plus />
              Create app
            </Button>
          )
        }
        emptyIcon={<Globe />}
        emptyTitle="No apps yet"
        emptyDescription={
          canEdit
            ? "An app is the site your members sign in to. Links in emails and invites open it."
            : "An app is the site your members sign in to. There are none yet."
        }
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
            ? `Members will no longer be able to sign in to ${deleteTarget.name} at ${hostOf(deleteTarget.domain)}, and links to it will stop working.`
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
}) {
  return (
    <Suspense fallback={null}>
      <AppsTableInner {...props} />
    </Suspense>
  );
}
