"use client";

import type { ColumnDef } from "@tanstack/react-table";

import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { ColumnHeader } from "@/components/data-table/column-header";
import { RowActions } from "@/components/data-table/row-actions";
import type { Automation } from "@/lib/api/types";

/**
 * Column defs for the automations list. Toggle/edit/delete are wired to the
 * caller's handlers (the table island owns the mutations + confirm dialog).
 * The page is manager-gated at the server and again in the island.
 */
export function automationColumns(
  triggerDescriptions: Map<string, string>,
  onToggleEnabled: (automation: Automation, enabled: boolean) => void,
  onEdit: (automation: Automation) => void,
  onDelete: (automation: Automation) => void,
): ColumnDef<Automation, unknown>[] {
  return [
    {
      accessorKey: "name",
      header: ({ column }) => <ColumnHeader column={column} title="Name" />,
      cell: ({ row }) => {
        const a = row.original;
        return (
          <div className="min-w-0 max-w-[22rem]">
            <div className="truncate font-medium text-ink">{a.name}</div>
            {a.description ? (
              <div className="truncate text-sm text-ink-4">{a.description}</div>
            ) : null}
          </div>
        );
      },
    },
    {
      accessorKey: "trigger",
      header: ({ column }) => <ColumnHeader column={column} title="Trigger" />,
      cell: ({ row }) => (
        <Badge variant="outline" title={triggerDescriptions.get(row.original.trigger)}>
          {row.original.trigger}
        </Badge>
      ),
    },
    {
      id: "steps",
      accessorFn: (row) => row.actions.length,
      header: ({ column }) => <ColumnHeader column={column} title="Steps" />,
      cell: ({ row }) => {
        const actions = row.original.actions;
        if (actions.length === 0) return <span className="text-ink-4">No steps</span>;
        return (
          <div className="min-w-0 max-w-[18rem]">
            <div className="text-ink-2">
              {actions.length} {actions.length === 1 ? "step" : "steps"}
            </div>
            <div className="truncate text-sm text-ink-4">
              {actions.map((a) => a.type).join(" → ")}
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
        const a = row.original;
        return (
          <div className="flex" onClick={(e) => e.stopPropagation()}>
            <Switch
              checked={a.enabled}
              onCheckedChange={(enabled) => onToggleEnabled(a, enabled)}
              aria-label={a.enabled ? `Disable ${a.name}` : `Enable ${a.name}`}
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
        const a = row.original;
        return (
          <div className="flex justify-end">
            <RowActions>
              <DropdownMenuItem onSelect={() => onEdit(a)}>Edit</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="danger" onSelect={() => onDelete(a)}>
                Delete
              </DropdownMenuItem>
            </RowActions>
          </div>
        );
      },
    },
  ];
}
