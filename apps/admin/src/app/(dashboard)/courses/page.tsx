"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { CourseStatusBadge } from "@/components/status-badge";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DataTable } from "@/components/data-table/data-table";
import { useDataTable } from "@/components/data-table/use-data-table";
import { ColumnHeader } from "@/components/data-table/column-header";
import { RowActions } from "@/components/data-table/row-actions";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  useCourses,
  useToggleCoursePublish,
  useDeleteCourse,
} from "@/lib/api/hooks";
import { useCurrentUser, useCaller } from "@/lib/auth/session-context";
import { can } from "@/lib/roles";
import { relativeTime, formatNumber } from "@/lib/format";
import type { Course } from "@/lib/api/types";

import { CourseFormSheet } from "./_components/course-form-sheet";

const CATEGORY_OPTIONS = [
  "Design",
  "Engineering",
  "Product",
  "Marketing",
  "Data",
  "Leadership",
  "Finance",
  "Operations",
].map((c) => ({ label: c, value: c }));

export default function CoursesPage() {
  const router = useRouter();
  const user = useCurrentUser();
  const caller = useCaller();

  const state = useDataTable({ pageSize: 10, initialSort: [{ id: "updatedAt", desc: true }] });
  const query = useCourses(state.params, caller);
  const rows = query.data?.rows;
  const total = query.data?.total ?? 0;

  const togglePublish = useToggleCoursePublish();
  const deleteCourse = useDeleteCourse();

  // Sheet state: undefined course = create, a course = edit.
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Course | undefined>(undefined);

  // Delete confirmation target.
  const [toDelete, setToDelete] = React.useState<Course | null>(null);

  const canCreate = can.createCourse(user);
  const canPublish = can.publishCourse(user);
  const canDelete = can.deleteCourse(user);

  const instructorNames = React.useMemo(
    () => Array.from(new Set((rows ?? []).map((c) => c.instructorName).filter(Boolean))),
    [rows],
  );

  const openCreate = React.useCallback(() => {
    setEditing(undefined);
    setSheetOpen(true);
  }, []);

  const openEdit = React.useCallback((course: Course) => {
    setEditing(course);
    setSheetOpen(true);
  }, []);

  const goToBuilder = React.useCallback(
    (course: Course) => router.push(`/courses/${course.id}`),
    [router],
  );

  const columns = React.useMemo<ColumnDef<Course, unknown>[]>(() => {
    const cols: ColumnDef<Course, unknown>[] = [
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
                  goToBuilder(course);
                }}
                className="text-left font-medium text-ink underline-offset-4 outline-none hover:text-brand hover:underline focus-visible:ring-2 focus-visible:ring-ring/40 rounded-sm"
              >
                {course.title}
              </button>
              <span className="text-xs text-ink-4">{course.category}</span>
            </div>
          );
        },
      },
      {
        accessorKey: "instructorName",
        header: ({ column }) => <ColumnHeader column={column} title="Instructor" />,
        cell: ({ row }) => <span className="text-ink-2">{row.original.instructorName}</span>,
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
        accessorKey: "lessonCount",
        header: ({ column }) => <ColumnHeader column={column} title="Lessons" align="right" />,
        meta: { align: "right" },
        cell: ({ row }) => (
          <span className="text-ink-2">{formatNumber(row.original.lessonCount)}</span>
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
          // Nothing actionable beyond View → still show View for everyone.
          return (
            <div className="flex justify-end">
              <RowActions>
                <DropdownMenuItem onClick={() => goToBuilder(course)}>View</DropdownMenuItem>
                {canEdit && (
                  <DropdownMenuItem onClick={() => openEdit(course)}>Edit</DropdownMenuItem>
                )}
                {canPublish && (
                  <DropdownMenuItem
                    onClick={() => togglePublish.mutate({ course })}
                  >
                    {course.status === "published" ? "Unpublish" : "Publish"}
                  </DropdownMenuItem>
                )}
                {canDelete && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="danger" onClick={() => setToDelete(course)}>
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
    return cols;
  }, [user, canPublish, canDelete, goToBuilder, openEdit, togglePublish]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Courses"
        description="Create, publish, and manage the courses in your organization."
      />

      <DataTable<Course>
        columns={columns}
        rows={rows}
        total={total}
        state={state}
        isLoading={query.isLoading}
        isFetching={query.isFetching}
        isError={query.isError}
        error={query.error ?? undefined}
        refetch={query.refetch}
        getRowId={(c) => c.id}
        searchPlaceholder="Search courses…"
        onRowClick={goToBuilder}
        facets={[
          {
            columnId: "status",
            title: "Status",
            options: [
              { label: "Draft", value: "draft" },
              { label: "Published", value: "published" },
            ],
          },
          {
            columnId: "category",
            title: "Category",
            options: CATEGORY_OPTIONS,
          },
        ]}
        toolbarActions={
          canCreate ? (
            <Button variant="primary" size="sm" onClick={openCreate}>
              New course
            </Button>
          ) : undefined
        }
        emptyTitle="No courses found"
        emptyDescription={
          canCreate
            ? "Get started by creating your first course."
            : "There are no courses assigned to you yet."
        }
        emptyAction={
          canCreate ? (
            <Button variant="secondary" size="sm" onClick={openCreate}>
              New course
            </Button>
          ) : undefined
        }
      />

      {/* Opened only via gated triggers (create button / Edit menu item). */}
      <CourseFormSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        course={editing}
        instructors={instructorNames}
      />

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(o) => {
          if (!o) setToDelete(null);
        }}
        title="Delete course?"
        description={
          toDelete ? (
            <>
              This permanently deletes <span className="font-medium text-ink">{toDelete.title}</span>,
              along with its modules and lessons. This can&apos;t be undone.
            </>
          ) : null
        }
        confirmLabel="Delete course"
        destructive
        pending={deleteCourse.isPending}
        onConfirm={() => {
          if (!toDelete) return;
          deleteCourse.mutate(toDelete.id, { onSuccess: () => setToDelete(null) });
        }}
      />
    </div>
  );
}
