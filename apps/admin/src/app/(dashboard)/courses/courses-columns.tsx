"use client";

import type { ColumnDef } from "@tanstack/react-table";

import { CourseStatusBadge } from "@/components/status-badge";
import { ColumnHeader } from "@/components/data-table/column-header";
import { RowActions } from "@/components/data-table/row-actions";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { can } from "@/lib/roles";
import { relativeTime, formatNumber } from "@/lib/format";
import type { Course, SessionUser } from "@/lib/api/types";

/**
 * Column set for the courses list. Callbacks drive the row-title link and the
 * row-action menu; role gating (`can.*`) hides actions the caller can't perform.
 * `user` is the server-resolved session user threaded down from the island.
 */
export function coursesColumns(opts: {
  user: SessionUser;
  onView: (course: Course) => void;
  onEdit: (course: Course) => void;
  onTogglePublish: (course: Course) => void;
  onDelete: (course: Course) => void;
}): ColumnDef<Course, unknown>[] {
  const { user, onView, onEdit, onTogglePublish, onDelete } = opts;
  const canPublish = can.publishCourse(user);
  const canDelete = can.deleteCourse(user);

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
      accessorKey: "moduleCount",
      header: ({ column }) => <ColumnHeader column={column} title="Modules" align="right" />,
      meta: { align: "right" },
      cell: ({ row }) => (
        <span className="text-ink-2">{formatNumber(row.original.moduleCount)}</span>
      ),
    },
    {
      accessorKey: "activityCount",
      header: ({ column }) => <ColumnHeader column={column} title="Activities" align="right" />,
      meta: { align: "right" },
      cell: ({ row }) => (
        <span className="text-ink-2">{formatNumber(row.original.activityCount)}</span>
      ),
    },
    {
      accessorKey: "enrolledCount",
      header: ({ column }) => <ColumnHeader column={column} title="Enrolled" align="right" />,
      meta: { align: "right" },
      cell: ({ row }) => (
        <span className="tabular-nums text-ink">{formatNumber(row.original.enrolledCount)}</span>
      ),
    },
    {
      accessorKey: "updatedAt",
      header: ({ column }) => <ColumnHeader column={column} title="Updated" align="right" />,
      meta: { align: "right" },
      cell: ({ row }) => (
        <span className="text-ink-3">{relativeTime(row.original.updatedAt)}</span>
      ),
    },
    {
      id: "actions",
      enableHiding: false,
      cell: ({ row }) => {
        const course = row.original;
        const canEdit = can.editCourse(user, course.id);
        return (
          <div className="flex justify-end">
            <RowActions>
              <DropdownMenuItem onClick={() => onView(course)}>View</DropdownMenuItem>
              {canEdit && (
                <DropdownMenuItem onClick={() => onEdit(course)}>Edit</DropdownMenuItem>
              )}
              {canPublish && (
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
