"use client";

import { Suspense, useCallback, useMemo, useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ForbiddenView } from "@/components/full-page-states";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/data-table/data-table";
import { useDataTable } from "@/components/data-table/use-data-table";
import { useCurrentUser } from "@/lib/auth/session-context";
import { isManager } from "@/lib/roles";
import type { AutomationTriggerInfo, ListParams, Webhook } from "@/lib/api/types";

import { webhookColumns } from "./webhooks-columns";
import { deleteWebhookAction, updateWebhookAction } from "./actions";
import { WebhookFormDialog } from "./_components/webhook-form-dialog";

function WebhooksTableInner({
  rows,
  total,
  params,
  triggers,
}: {
  rows: Webhook[];
  total: number;
  params: ListParams;
  triggers: AutomationTriggerInfo[];
}) {
  const router = useRouter();
  const user = useCurrentUser();

  const table = useDataTable({ pageSize: params.pageSize, initialSort: params.sort });
  const isStale = JSON.stringify(table.params) !== JSON.stringify(params);

  const [optimisticRows, applyOptimistic] = useOptimistic(
    rows,
    (state: Webhook[], patch: { id: string; enabled: boolean }) =>
      state.map((w) => (w.id === patch.id ? { ...w, enabled: patch.enabled } : w)),
  );

  const [isPending, startTransition] = useTransition();
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Webhook | null>(null);

  const onToggleEnabled = useCallback(
    (w: Webhook, enabled: boolean) => {
      startTransition(async () => {
        applyOptimistic({ id: w.id, enabled });
        try {
          await updateWebhookAction(w.id, { enabled });
          toast.success(enabled ? "Webhook enabled" : "Webhook disabled");
        } catch (err) {
          toast.error("Couldn't update webhook", { description: (err as Error).message });
        }
      });
    },
    [applyOptimistic],
  );

  const onEdit = useCallback(
    (w: Webhook) => router.push(`/automations/webhooks/${w.id}`),
    [router],
  );

  const confirmDelete = useCallback(() => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    startTransition(async () => {
      try {
        await deleteWebhookAction(target.id);
        toast.success("Webhook deleted");
        setDeleteTarget(null);
      } catch (err) {
        toast.error("Couldn't delete webhook", { description: (err as Error).message });
      }
    });
  }, [deleteTarget]);

  const triggerInfo = useMemo(() => new Map(triggers.map((t) => [t.type, t])), [triggers]);

  const columns = useMemo(
    () => webhookColumns(triggerInfo, onToggleEnabled, onEdit, setDeleteTarget),
    [triggerInfo, onToggleEnabled, onEdit],
  );

  if (!isManager(user.role)) return <ForbiddenView />;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Webhooks" subtitle="Send events to your own endpoints as they happen." />

      <DataTable<Webhook>
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
        searchPlaceholder="Search webhooks…"
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
            columnId: "events",
            title: "Event",
            options: triggers.map((t) => ({ label: t.label, value: t.type })),
          },
        ]}
        toolbarActions={
          <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
            <Plus />
            Add webhook
          </Button>
        }
        emptyTitle="No webhooks yet"
        emptyDescription="Add a webhook to send events — like a student being granted access — to your own systems."
        emptyAction={
          <Button variant="secondary" size="sm" onClick={() => setCreateOpen(true)}>
            Add webhook
          </Button>
        }
      />

      <WebhookFormDialog open={createOpen} onOpenChange={setCreateOpen} triggers={triggers} />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Delete webhook?"
        description={
          deleteTarget
            ? `Events will stop being sent to ${deleteTarget.url} and its signing secret is destroyed. Past deliveries are kept for auditing.`
            : ""
        }
        confirmLabel="Delete webhook"
        destructive
        pending={isPending}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

export function WebhooksTable(props: {
  rows: Webhook[];
  total: number;
  params: ListParams;
  triggers: AutomationTriggerInfo[];
}) {
  return (
    <Suspense fallback={null}>
      <WebhooksTableInner {...props} />
    </Suspense>
  );
}
