"use client";

import { Suspense, useCallback, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { DataTable } from "@/components/data-table/data-table";
import { useDataTable } from "@/components/data-table/use-data-table";
import type { AutomationRun, AutomationTriggerInfo, ListParams } from "@/lib/api/types";

import { resendDeliveryAction } from "../../../actions";
import { deliveryColumns } from "./delivery-columns";

function DeliveriesTableInner({
  webhookId,
  rows,
  total,
  params,
  triggers,
}: {
  webhookId: string;
  rows: AutomationRun[];
  total: number;
  params: ListParams;
  triggers: AutomationTriggerInfo[];
}) {
  const router = useRouter();
  const table = useDataTable({ pageSize: params.pageSize, initialSort: params.sort });
  const isStale = JSON.stringify(table.params) !== JSON.stringify(params);
  const [isPending, startTransition] = useTransition();

  const onResend = useCallback(
    (run: AutomationRun) => {
      startTransition(async () => {
        try {
          await resendDeliveryAction(webhookId, run.id);
          toast.success("Delivery resent");
          router.refresh();
        } catch (err) {
          toast.error("Couldn't resend", { description: (err as Error).message });
        }
      });
    },
    [webhookId, router],
  );

  const triggerInfo = useMemo(() => new Map(triggers.map((t) => [t.type, t])), [triggers]);
  const columns = useMemo(() => deliveryColumns(triggerInfo, onResend), [triggerInfo, onResend]);

  return (
    <DataTable<AutomationRun>
      columns={columns}
      rows={rows}
      total={total}
      state={table}
      isLoading={false}
      isFetching={isStale || isPending}
      isError={false}
      refetch={() => router.refresh()}
      getRowId={(r) => r.id}
      searchable={false}
      facets={[
        {
          columnId: "status",
          title: "Status",
          options: [
            { label: "Delivered", value: "completed" },
            { label: "Failed", value: "failed" },
            { label: "Sending", value: "running" },
          ],
        },
      ]}
      emptyTitle="No deliveries yet"
      emptyDescription="Deliveries show up here as subscribed events happen."
    />
  );
}

export function DeliveriesTable(props: {
  webhookId: string;
  rows: AutomationRun[];
  total: number;
  params: ListParams;
  triggers: AutomationTriggerInfo[];
}) {
  return (
    <Suspense fallback={null}>
      <DeliveriesTableInner {...props} />
    </Suspense>
  );
}
