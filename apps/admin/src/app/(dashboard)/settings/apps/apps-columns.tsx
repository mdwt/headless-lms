"use client";

import type { ColumnDef } from "@tanstack/react-table";

import { Badge } from "@/components/ui/badge";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { ColumnHeader } from "@/components/data-table/column-header";
import { RowActions } from "@/components/data-table/row-actions";
import type { OrgApp } from "@/lib/api/types";

import { hostOf } from "./list-utils";

export const COURSES_LABEL = "Courses and downloads";
export const COMMUNITY_LABEL = "Communities and events";

export function appColumns(
  onEdit: (app: OrgApp) => void,
  onDelete: (app: OrgApp) => void,
  canEdit: boolean,
): ColumnDef<OrgApp, unknown>[] {
  return [
    {
      accessorKey: "name",
      header: ({ column }) => <ColumnHeader column={column} title="Name" />,
      enableHiding: false,
      cell: ({ row }) => (
        <div className="max-w-[18rem] truncate font-medium text-ink">{row.original.name}</div>
      ),
    },
    {
      accessorKey: "domain",
      header: ({ column }) => <ColumnHeader column={column} title="Domain" />,
      cell: ({ row }) => (
        <div className="max-w-[22rem] truncate text-ink-2" title={row.original.domain}>
          {hostOf(row.original.domain)}
        </div>
      ),
    },
    {
      id: "content",
      header: ({ column }) => <ColumnHeader column={column} title="Content" />,
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1.5">
          {row.original.courses ? <Badge variant="neutral">{COURSES_LABEL}</Badge> : null}
          {row.original.community ? <Badge variant="neutral">{COMMUNITY_LABEL}</Badge> : null}
        </div>
      ),
    },
    {
      accessorKey: "slug",
      header: ({ column }) => <ColumnHeader column={column} title="Slug" />,
      cell: ({ row }) => <span className="font-mono text-ink-3">{row.original.slug}</span>,
    },
    {
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      enableSorting: false,
      enableHiding: false,
      meta: { align: "right" },
      cell: ({ row }) => {
        const app = row.original;
        if (!canEdit) return null;
        return (
          <div className="flex justify-end">
            <RowActions label={`Actions for ${app.name}`}>
              <DropdownMenuItem onSelect={() => onEdit(app)}>Edit</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="danger" onSelect={() => onDelete(app)}>
                Delete
              </DropdownMenuItem>
            </RowActions>
          </div>
        );
      },
    },
  ];
}
