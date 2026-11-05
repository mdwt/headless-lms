"use client";

import type { ColumnDef } from "@tanstack/react-table";

import { CourseStatusBadge } from "@/components/status-badge";
import { ColumnHeader } from "@/components/data-table/column-header";
import { RowActions } from "@/components/data-table/row-actions";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { relativeTime } from "@/lib/format";
import type { Course } from "@/lib/api/types";
import type { Permissions } from "@/lib/permissions";

/**
 * Column set for the courses list. Callbacks drive the row-title link and the
 * row-action menu; the caller's permissions on each course hide what they can't do.
 */
export function coursesColumns(opts: {
  permissions: Permissions;
  onView: (course: Course) => void;
  onEdit: (course: Course) => void;
  onTogglePublish: (course: Course) => void;
  onDelete: (course: Course) => void;
}): ColumnDef<Course, unknown>[] {
  const { permissions, onView, onEdit, onTogglePublish, onDelete } = opts;

  return [
    {
      accessorKey: "title",
      header: ({ column }) => <ColumnHeader column={column} title="Course" />,
      enableHiding: false,
      cell: ({ row }) => {
        const course = row.original;
        return (
          <div className="flex flex-col gap-0.5">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onView(course);
              }}
              className="text-left font-medium text-ink underline-offset-4 outline-none hover:text-brand hover:underline focus-visible:ring-2 focus-visible:ring-ring/40 rounded-sm"
            >
              {course.title}
            </button>
            <span className="text-xs text-ink-4">{course.slug}</span>
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
        const course = row.original;
        const canEdit = permissions.has("courses:write", course.id);
        const canDelete = permissions.has("courses:delete", course.id);
        return (
          <div className="flex justify-end">
            <RowActions>
              <DropdownMenuItem onClick={() => onView(course)}>View</DropdownMenuItem>
              {canEdit && <DropdownMenuItem onClick={() => onEdit(course)}>Edit</DropdownMenuItem>}
              {canEdit && (
                <DropdownMenuItem onClick={() => onTogglePublish(course)}>
                  {course.status === "published" ? "Unpublish" : "Publish"}
                </DropdownMenuItem>
              )}
              {canDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="danger" onClick={() => onDelete(course)}>
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
