"use client";

import type { ColumnDef } from "@tanstack/react-table";

import { Badge } from "@/components/ui/badge";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { ColumnHeader } from "@/components/data-table/column-header";
import { RowActions } from "@/components/data-table/row-actions";
import { DeliveryStatusBadge } from "@/components/status-badge";
import type { AutomationRun, AutomationTriggerInfo } from "@/lib/api/types";
import { formatDate, relativeTime } from "@/lib/format";

export function deliveryColumns(
  triggerInfo: Map<string, AutomationTriggerInfo>,
  onResend: (run: AutomationRun) => void,
): ColumnDef<AutomationRun, unknown>[] {
  return [
    {
      id: "event",
      header: () => <span>Event</span>,
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => {
        const run = row.original;
        return (
          <div className="flex min-w-0 max-w-[22rem] flex-col">
            <div className="flex items-center gap-1.5">
              <span className="truncate font-medium text-ink">
                {triggerInfo.get(run.trigger)?.label ?? run.trigger}
              </span>
              {run.rerunOf ? <Badge variant="outline">Resent</Badge> : null}
            </div>
            <span className="truncate font-mono text-xs text-ink-4">{run.eventId}</span>
          </div>
        );
      },
    },
    {
      accessorKey: "status",
      header: ({ column }) => <ColumnHeader column={column} title="Status" />,
      cell: ({ row }) => <DeliveryStatusBadge status={row.original.status} />,
    },
    {
      accessorKey: "startedAt",
      header: ({ column }) => <ColumnHeader column={column} title="Sent" />,
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-ink-2" title={formatDate(row.original.startedAt)}>
          {relativeTime(row.original.startedAt)}
        </span>
      ),
    },
    {
      id: "error",
      header: () => <span>Error</span>,
      enableSorting: false,
      cell: ({ row }) => {
        const error = row.original.actionResults.find((r) => r.status === "failed")?.error;
        return error ? (
          <span className="line-clamp-2 max-w-[20rem] text-sm text-ink-3" title={error}>
            {error}
          </span>
        ) : (
          <span className="text-ink-4">—</span>
        );
      },
    },
    {
      id: "actions",
      header: () => null,
      enableSorting: false,
      enableHiding: false,
      meta: { align: "right" },
      cell: ({ row }) => (
        <div className="flex justify-end">
          <RowActions>
            <DropdownMenuItem
              onSelect={() => onResend(row.original)}
              disabled={row.original.status === "running"}
            >
              Resend
            </DropdownMenuItem>
          </RowActions>
        </div>
      ),
    },
  ];
}
