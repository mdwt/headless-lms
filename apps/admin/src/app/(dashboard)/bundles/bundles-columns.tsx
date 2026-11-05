"use client";

import type { ColumnDef } from "@tanstack/react-table";

import { ColumnHeader } from "@/components/data-table/column-header";
import { RowActions } from "@/components/data-table/row-actions";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { relativeTime } from "@/lib/format";
import type { BundleRow } from "@/lib/api/types";
import type { Permissions } from "@/lib/permissions";

/**
 * Column set for the bundles list. Callbacks drive the row-title link and the
 * row-action menu; the caller's permissions hide actions they can't perform.
 */
export function bundlesColumns(opts: {
  permissions: Permissions;
  onEdit: (bundle: BundleRow) => void;
  onDelete: (bundle: BundleRow) => void;
}): ColumnDef<BundleRow, unknown>[] {
  const { permissions, onEdit, onDelete } = opts;
  const canEdit = permissions.has("bundles:write");
  const canDelete = permissions.has("bundles:delete");

  return [
    {
      accessorKey: "name",
      header: ({ column }) => <ColumnHeader column={column} title="Name" />,
      enableHiding: false,
      cell: ({ row }) => {
        const bundle = row.original;
        return (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onEdit(bundle);
            }}
            className="text-left font-medium text-ink underline-offset-4 outline-none hover:text-brand hover:underline focus-visible:ring-2 focus-visible:ring-ring/40 rounded-sm"
          >
            {bundle.name}
          </button>
        );
      },
    },
    {
      id: "items",
      header: ({ column }) => <ColumnHeader column={column} title="Content" />,
      enableSorting: false,
      cell: ({ row }) => {
        const count = row.original.contentIds.length;
        return (
          <span className="text-ink-2">
            {count} {count === 1 ? "item" : "items"}
          </span>
        );
      },
    },
    {
      accessorKey: "updatedAt",
      header: ({ column }) => <ColumnHeader column={column} title="Updated" align="right" />,
      meta: { align: "right" },
      cell: ({ row }) => <span className="text-ink-3">{relativeTime(row.original.updatedAt)}</span>,
    },
    {
      id: "actions",
      enableHiding: false,
      cell: ({ row }) => {
        const bundle = row.original;
        return (
          <div className="flex justify-end">
            <RowActions>
              {canEdit && <DropdownMenuItem onClick={() => onEdit(bundle)}>Edit</DropdownMenuItem>}
              {canDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="danger" onClick={() => onDelete(bundle)}>
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
