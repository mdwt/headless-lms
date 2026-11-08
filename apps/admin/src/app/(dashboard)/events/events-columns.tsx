"use client";

import type { ColumnDef } from "@tanstack/react-table";

import { EventStatusBadge } from "@/components/status-badge";
import { ColumnHeader } from "@/components/data-table/column-header";
import { RowActions } from "@/components/data-table/row-actions";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { formatNumber } from "@/lib/format";
import type { EventItem } from "@/lib/api/types";
import type { Permissions } from "@/lib/permissions";

import { formatEventDate, hasEnded } from "./_lib/event-time";

export function eventsColumns(opts: {
  permissions: Permissions;
  now: number;
  onView: (event: EventItem) => void;
  onTogglePublish: (event: EventItem) => void;
  onDelete: (event: EventItem) => void;
}): ColumnDef<EventItem, unknown>[] {
  const { permissions, now, onView, onTogglePublish, onDelete } = opts;

  return [
    {
      accessorKey: "title",
      header: ({ column }) => <ColumnHeader column={column} title="Title" />,
      enableHiding: false,
      cell: ({ row }) => {
        const event = row.original;
        return (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onView(event);
            }}
            className="text-left font-medium text-ink underline-offset-4 outline-none hover:text-brand hover:underline focus-visible:ring-2 focus-visible:ring-ring/40 rounded-sm"
          >
            {event.title}
          </button>
        );
      },
    },
    {
      accessorKey: "startsAt",
      header: ({ column }) => <ColumnHeader column={column} title="Date and time" />,
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-ink-2">{formatEventDate(row.original)}</span>
      ),
    },
    {
      accessorKey: "status",
      header: ({ column }) => <ColumnHeader column={column} title="Status" />,
      enableSorting: false,
      cell: ({ row }) => (
        <EventStatusBadge status={row.original.status} ended={hasEnded(row.original, now)} />
      ),
    },
    {
      id: "capacity",
      header: ({ column }) => <ColumnHeader column={column} title="Capacity" align="right" />,
      enableSorting: false,
      meta: { align: "right" },
      cell: ({ row }) => {
        const capacity = row.original.settings.capacity;
        return (
          <span className="text-ink-3 tabular-nums">
            {capacity === null ? "No limit" : formatNumber(capacity)}
          </span>
        );
      },
    },
    {
      id: "actions",
      enableHiding: false,
      cell: ({ row }) => {
        const event = row.original;
        const canPublish = permissions.has("events:write", event.id) && event.status !== "canceled";
        const canDelete = permissions.has("events:delete", event.id);
        if (!canPublish && !canDelete) return null;
        return (
          <div className="flex justify-end">
            <RowActions>
              {canPublish && (
                <DropdownMenuItem onClick={() => onTogglePublish(event)}>
                  {event.status === "published" ? "Unpublish" : "Publish"}
                </DropdownMenuItem>
              )}
              {canDelete && (
                <>
                  {canPublish && <DropdownMenuSeparator />}
                  <DropdownMenuItem variant="danger" onClick={() => onDelete(event)}>
                    Delete
                  </DropdownMenuItem>
                </>
              )}
            </RowActions>
          </div>
        );
      },
    },
  ];
}
