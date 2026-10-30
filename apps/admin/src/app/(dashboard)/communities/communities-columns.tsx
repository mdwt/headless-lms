"use client";

import type { ColumnDef } from "@tanstack/react-table";

import { CourseStatusBadge } from "@/components/status-badge";
import { ColumnHeader } from "@/components/data-table/column-header";
import { RowActions } from "@/components/data-table/row-actions";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { can } from "@/lib/roles";
import { relativeTime } from "@/lib/format";
import type { Community, SessionUser } from "@/lib/api/types";

export function communitiesColumns(opts: {
  user: SessionUser;
  onView: (community: Community) => void;
  onTogglePublish: (community: Community) => void;
  onDelete: (community: Community) => void;
}): ColumnDef<Community, unknown>[] {
  const { user, onView, onTogglePublish, onDelete } = opts;
  const canManage = can.manageCommunities(user);

  return [
    {
      accessorKey: "title",
      header: ({ column }) => <ColumnHeader column={column} title="Community" />,
      enableHiding: false,
      cell: ({ row }) => {
        const community = row.original;
        return (
          <div className="flex flex-col gap-0.5">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onView(community);
              }}
              className="rounded-sm text-left font-medium text-ink underline-offset-4 outline-none hover:text-brand hover:underline focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              {community.title}
            </button>
            <span className="text-xs text-ink-4">{community.slug}</span>
          </div>
        );
      },
    },
    {
      accessorKey: "status",
      header: ({ column }) => <ColumnHeader column={column} title="Status" />,
      cell: ({ row }) => <CourseStatusBadge status={row.original.status} />,
    },
    {
      id: "messages",
      header: ({ column }) => <ColumnHeader column={column} title="Direct messages" />,
      enableSorting: false,
      cell: ({ row }) => (
        <span className="text-ink-2">{row.original.settings.dm.enabled ? "On" : "Off"}</span>
      ),
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
        const community = row.original;
        return (
          <div className="flex justify-end">
            <RowActions>
              <DropdownMenuItem onClick={() => onView(community)}>View</DropdownMenuItem>
              {canManage && (
                <>
                  <DropdownMenuItem onClick={() => onTogglePublish(community)}>
                    {community.status === "published" ? "Unpublish" : "Publish"}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="danger" onClick={() => onDelete(community)}>
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
