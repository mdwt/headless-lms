"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ForbiddenView } from "@/components/full-page-states";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/data-table/data-table";
import { useDataTable } from "@/components/data-table/use-data-table";
import { useCurrentUser } from "@/lib/auth/session-context";
import { isManager } from "@/lib/roles";
import type { Automation, AutomationTriggerInfo, ListParams } from "@/lib/api/types";

import { automationColumns } from "./automations-columns";
import { deleteAutomationAction, updateAutomationAction } from "./actions";

/** Deep-equal on the small, JSON-safe `ListParams` shape (both sides built by
 *  the same `parseListParams`, so key order is stable). */
function sameParams(a: ListParams, b: ListParams): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// Automations table (client): rows come in as props; edits go through server actions.
function AutomationsTableInner({
  rows,
  total,
  params,
  triggers,
}: {
  rows: Automation[];
  total: number;
  params: ListParams;
  triggers: AutomationTriggerInfo[];
}) {
  const router = useRouter();
  const user = useCurrentUser();

  const table = useDataTable({ pageSize: params.pageSize, initialSort: params.sort });

  // Navigation in flight: URL is ahead of the rows the server rendered.
  const isStale = !sameParams(table.params, params);

  // Optimistic enabled flips. Base resets to `rows` whenever the RSC re-renders,
  // so the optimistic value is discarded once the real (revalidated) row lands.
  const [optimisticRows, applyOptimistic] = React.useOptimistic(
    rows,
    (state: Automation[], patch: { id: string; enabled: boolean }) =>
      state.map((a) => (a.id === patch.id ? { ...a, enabled: patch.enabled } : a)),
  );

  const [isPending, startTransition] = React.useTransition();
  const [deleteTarget, setDeleteTarget] = React.useState<Automation | null>(null);

  const onToggleEnabled = React.useCallback(
    (a: Automation, enabled: boolean) => {
      startTransition(async () => {
        applyOptimistic({ id: a.id, enabled });
        try {
          await updateAutomationAction(a.id, { enabled });
          toast.success(enabled ? "Automation enabled" : "Automation disabled");
        } catch (err) {
          toast.error("Couldn't update automation", { description: (err as Error).message });
        }
      });
    },
    [applyOptimistic],
  );

  const onEdit = React.useCallback(
    (a: Automation) => router.push(`/automations/${a.id}`),
    [router],
  );

  const onDelete = React.useCallback((a: Automation) => setDeleteTarget(a), []);

  const confirmDelete = React.useCallback(() => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    startTransition(async () => {
      try {
        await deleteAutomationAction(target.id);
        toast.success("Automation deleted");
        setDeleteTarget(null);
      } catch (err) {
        toast.error("Couldn't delete automation", { description: (err as Error).message });
      }
    });
  }, [deleteTarget]);

  const triggerDescriptions = React.useMemo(
    () => new Map(triggers.map((t) => [t.type, t.description])),
    [triggers],
  );

  const columns = React.useMemo(
    () => automationColumns(triggerDescriptions, onToggleEnabled, onEdit, onDelete),
    [triggerDescriptions, onToggleEnabled, onEdit, onDelete],
  );

  if (!isManager(user.role)) return <ForbiddenView />;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Automations"
        subtitle="React to events — when something happens, run a series of actions."
      />

      <DataTable<Automation>
        columns={columns}
        rows={optimisticRows}
        total={total}
        state={table}
        isLoading={false}
        isFetching={isStale || isPending}
        isError={false}
        refetch={() => router.refresh()}
        getRowId={(r) => r.id}
        onRowClick={onEdit}
        searchPlaceholder="Search automations…"
        facets={[
          {
            columnId: "enabled",
            title: "Enabled",
            options: [
              { label: "Enabled", value: "true" },
              { label: "Disabled", value: "false" },
            ],
          },
          {
            columnId: "trigger",
            title: "Trigger",
            options: triggers.map((t) => ({ label: t.type, value: t.type })),
          },
        ]}
        toolbarActions={
          <Button variant="primary" size="sm" asChild>
            <Link href="/automations/new">New automation</Link>
          </Button>
        }
        emptyTitle="No automations yet"
        emptyDescription="Create an automation to react to events — like emailing a student when they complete a course."
        emptyAction={
          <Button variant="secondary" size="sm" asChild>
            <Link href="/automations/new">New automation</Link>
          </Button>
        }
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Delete automation?"
        description={
          deleteTarget
            ? `"${deleteTarget.name}" will stop running and its configuration will be removed. Past run history is kept for auditing.`
            : ""
        }
        confirmLabel="Delete automation"
        destructive
        pending={isPending}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

export function AutomationsTable(props: {
  rows: Automation[];
  total: number;
  params: ListParams;
  triggers: AutomationTriggerInfo[];
}) {
  // `useDataTable` reads `useSearchParams()`, which requires a Suspense boundary.
  return (
    <React.Suspense fallback={null}>
      <AutomationsTableInner {...props} />
    </React.Suspense>
  );
}
