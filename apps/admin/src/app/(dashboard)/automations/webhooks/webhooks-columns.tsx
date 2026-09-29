"use client";

import type { ColumnDef } from "@tanstack/react-table";

import { Switch } from "@/components/ui/switch";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { ColumnHeader } from "@/components/data-table/column-header";
import { RowActions } from "@/components/data-table/row-actions";
import type { AutomationTriggerInfo, Webhook } from "@/lib/api/types";

export function webhookColumns(
  triggerInfo: Map<string, AutomationTriggerInfo>,
  onToggleEnabled: (webhook: Webhook, enabled: boolean) => void,
  onEdit: (webhook: Webhook) => void,
  onDelete: (webhook: Webhook) => void,
): ColumnDef<Webhook, unknown>[] {
  return [
    {
      accessorKey: "url",
      header: ({ column }) => <ColumnHeader column={column} title="Endpoint" />,
      cell: ({ row }) => {
        const w = row.original;
        return (
          <div className="min-w-0 max-w-[26rem]">
            <div className="truncate font-medium text-ink" title={w.url}>
              {w.url}
            </div>
            {w.description ? (
              <div className="truncate text-sm text-ink-4">{w.description}</div>
            ) : null}
          </div>
        );
      },
    },
    {
      accessorKey: "events",
      header: ({ column }) => <ColumnHeader column={column} title="Events" />,
      cell: ({ row }) => {
        const labels = row.original.events.map((e) => triggerInfo.get(e)?.label ?? e);
        return (
          <div className="min-w-0 max-w-[18rem]">
            <div className="text-ink-2">
              {labels.length} {labels.length === 1 ? "event" : "events"}
            </div>
            <div className="truncate text-sm text-ink-4" title={labels.join(", ")}>
              {labels.join(", ")}
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "enabled",
      header: ({ column }) => <ColumnHeader column={column} title="Enabled" />,
      enableSorting: false,
      cell: ({ row }) => {
        const w = row.original;
        return (
          <div className="flex" onClick={(e) => e.stopPropagation()}>
            <Switch
              checked={w.enabled}
              onCheckedChange={(enabled) => onToggleEnabled(w, enabled)}
              aria-label={w.enabled ? `Disable ${w.url}` : `Enable ${w.url}`}
            />
          </div>
        );
      },
    },
    {
      id: "actions",
      header: () => null,
      enableSorting: false,
      enableHiding: false,
      meta: { align: "right" },
      cell: ({ row }) => {
        const w = row.original;
        return (
          <div className="flex justify-end">
            <RowActions>
              <DropdownMenuItem onSelect={() => onEdit(w)}>Edit</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="danger" onSelect={() => onDelete(w)}>
                Delete
              </DropdownMenuItem>
            </RowActions>
          </div>
        );
      },
    },
  ];
}
