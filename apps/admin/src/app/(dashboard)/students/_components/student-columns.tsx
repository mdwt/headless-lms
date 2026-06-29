"use client";

import type { ColumnDef } from "@tanstack/react-table";

import { ColumnHeader } from "@/components/data-table/column-header";
import { RowActions } from "@/components/data-table/row-actions";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { NameAvatar } from "@/components/ui/avatar";
import { relativeTime } from "@/lib/format";
import type { Student } from "@/lib/api/types";

import { ProgressCell } from "./progress-meter";

/**
 * Column set for the students list. `onView` drives the row-action menu;
 * row clicks are wired separately on the table (onRowClick).
 */
export function studentColumns(onView: (id: string) => void): ColumnDef<Student, unknown>[] {
  return [
    {
      accessorKey: "name",
      header: ({ column }) => <ColumnHeader column={column} title="Student" />,
      cell: ({ row }) => {
        const s = row.original;
        return (
          <div className="flex items-center gap-3">
            <NameAvatar name={s.name} image={s.image} />
            <div className="flex min-w-0 flex-col">
              <span className="truncate font-medium text-ink">{s.name}</span>
              <span className="truncate text-xs text-ink-3">{s.email}</span>
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "enrollmentCount",
      header: ({ column }) => <ColumnHeader column={column} title="Entitlements" align="right" />,
      cell: ({ row }) => (
        <span className="text-ink-2">{row.original.enrollmentCount}</span>
      ),
      meta: { align: "right" },
    },
    {
      accessorKey: "avgProgress",
      header: ({ column }) => <ColumnHeader column={column} title="Avg. progress" align="right" />,
      cell: ({ row }) => <ProgressCell value={row.original.avgProgress} />,
      meta: { align: "right" },
    },
    {
      accessorKey: "joinedAt",
      header: ({ column }) => <ColumnHeader column={column} title="Joined" />,
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-ink-3">{relativeTime(row.original.joinedAt)}</span>
      ),
    },
    {
      accessorKey: "lastActiveAt",
      header: ({ column }) => <ColumnHeader column={column} title="Last active" />,
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-ink-3">{relativeTime(row.original.lastActiveAt)}</span>
      ),
    },
    {
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => (
        <div className="flex justify-end">
          <RowActions>
            <DropdownMenuItem onClick={() => onView(row.original.id)}>View student</DropdownMenuItem>
          </RowActions>
        </div>
      ),
      meta: { align: "right" },
    },
  ];
}
