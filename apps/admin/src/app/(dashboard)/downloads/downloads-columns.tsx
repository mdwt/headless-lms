"use client";

import type { ColumnDef } from "@tanstack/react-table";

import { CourseStatusBadge } from "@/components/status-badge";
import { ColumnHeader } from "@/components/data-table/column-header";
import { RowActions } from "@/components/data-table/row-actions";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { relativeTime } from "@/lib/format";
import type { Download } from "@/lib/api/types";
import type { Permissions } from "@/lib/permissions";

/**
 * Column set for the downloads list. Callbacks drive the row-title link and
 * the row-action menu; the caller's permissions on each download hide what
 * they can't do. Reuses `CourseStatusBadge` — both content types share the same
 * draft/published status shape.
 */
export function downloadsColumns(opts: {
  permissions: Permissions;
  onView: (download: Download) => void;
  onEdit: (download: Download) => void;
  onTogglePublish: (download: Download) => void;
  onDelete: (download: Download) => void;
}): ColumnDef<Download, unknown>[] {
  const { permissions, onView, onEdit, onTogglePublish, onDelete } = opts;

  return [
    {
      accessorKey: "title",
      header: ({ column }) => <ColumnHeader column={column} title="Title" />,
      enableHiding: false,
      cell: ({ row }) => {
        const download = row.original;
        return (
          <div className="flex flex-col gap-0.5">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onView(download);
              }}
              className="text-left font-medium text-ink underline-offset-4 outline-none hover:text-brand hover:underline focus-visible:ring-2 focus-visible:ring-ring/40 rounded-sm"
            >
              {download.title}
            </button>
            <span className="text-xs text-ink-4">{download.slug}</span>
          </div>
        );
      },
    },
    {
      accessorKey: "category",
      header: ({ column }) => <ColumnHeader column={column} title="Category" />,
      cell: ({ row }) => <span className="text-ink-2">{row.original.category}</span>,
    },
    {
      accessorKey: "status",
      header: ({ column }) => <ColumnHeader column={column} title="Status" />,
      cell: ({ row }) => <CourseStatusBadge status={row.original.status} />,
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
        const download = row.original;
        const canEdit = permissions.has("downloads:write", download.id);
        const canPublish = canEdit;
        const canDelete = permissions.has("downloads:delete", download.id);
        return (
          <div className="flex justify-end">
            <RowActions>
              {canEdit && (
                <DropdownMenuItem onClick={() => onEdit(download)}>Edit</DropdownMenuItem>
              )}
              {canPublish && (
                <DropdownMenuItem onClick={() => onTogglePublish(download)}>
                  {download.status === "published" ? "Unpublish" : "Publish"}
                </DropdownMenuItem>
              )}
              {canDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="danger" onClick={() => onDelete(download)}>
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
