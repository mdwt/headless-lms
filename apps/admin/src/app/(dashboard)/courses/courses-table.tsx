"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DataTable } from "@/components/data-table/data-table";
import { useDataTable } from "@/components/data-table/use-data-table";
import { useCurrentUser } from "@/lib/auth/session-context";
import { can } from "@/lib/roles";
import type { Course, ListParams } from "@/lib/api/types";

import { coursesColumns } from "./courses-columns";
import { CourseFormSheet } from "./_components/course-form-sheet";
import { setCoursePublishedAction, deleteCourseAction } from "./actions";

/** The eight fixed course categories, shared with the create/edit form sheet. */
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

/** Deep-equal on the small, JSON-safe `ListParams` shape (both sides built by
 *  the same `parseListParams`, so key order is stable). */
function sameParams(a: ListParams, b: ListParams): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Courses list client island (option 2). Rows arrive as PROPS from the Server
 * Component — no `useCourses`, no client query cache. `useDataTable` still owns
 * the URL state (page/sort/filter/search), so changing it re-runs the RSC and
 * new rows stream back down. Writes go through Server Actions:
 *   - publish: `useOptimistic` flips the status instantly, reconciled when the
 *     action's `revalidatePath` streams fresh rows back as props;
 *   - delete: `useTransition` drives the confirm dialog's pending state;
 *   - create/edit: the sheet calls the actions directly.
 * The "dim while loading" that react-query gave via `isFetching` is derived
 * here from staleness: the URL (`table.params`) has moved ahead of the
 * server-rendered `params` until the RSC catches up.
 */
function CoursesTableInner({
  rows,
  total,
  params,
}: {
  rows: Course[];
  total: number;
  params: ListParams;
}) {
  const router = useRouter();
  const user = useCurrentUser();

  const table = useDataTable({ pageSize: params.pageSize, initialSort: params.sort });

  // Navigation in flight: URL is ahead of the rows the server rendered.
  const isStale = !sameParams(table.params, params);

  // Optimistic publish flips. Base resets to `rows` whenever the RSC re-renders,
  // so the optimistic value is discarded once the real (revalidated) row lands.
  const [optimisticRows, applyOptimistic] = React.useOptimistic(
    rows,
    (state: Course[], patch: { id: string; status: Course["status"] }) =>
      state.map((c) => (c.id === patch.id ? { ...c, status: patch.status } : c)),
  );

  const [isPending, startTransition] = React.useTransition();

  // Sheet state: undefined course = create, a course = edit.
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Course | undefined>(undefined);

  // Delete confirmation target.
  const [toDelete, setToDelete] = React.useState<Course | null>(null);

  const canCreate = can.createCourse(user);

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

  const onTogglePublish = React.useCallback(
    (course: Course) => {
      const next: Course["status"] = course.status === "published" ? "draft" : "published";
      startTransition(async () => {
        applyOptimistic({ id: course.id, status: next });
        try {
          await setCoursePublishedAction(course.id, next);
          toast.success(next === "published" ? "Course published" : "Moved to draft");
        } catch (e) {
          toast.error("Couldn't update status", { description: (e as Error).message });
        }
      });
    },
    [applyOptimistic],
  );

  const confirmDelete = React.useCallback(() => {
    if (!toDelete) return;
    const course = toDelete;
    startTransition(async () => {
      try {
        await deleteCourseAction(course.id);
        toast.success("Course deleted");
        setToDelete(null);
      } catch (e) {
        toast.error("Couldn't delete course", { description: (e as Error).message });
      }
    });
  }, [toDelete]);

  const columns = React.useMemo(
    () =>
      coursesColumns({
        user,
        onView: goToBuilder,
        onEdit: openEdit,
        onTogglePublish,
        onDelete: setToDelete,
      }),
    [user, goToBuilder, openEdit, onTogglePublish],
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Courses"
      />

      <DataTable<Course>
        columns={columns}
        rows={optimisticRows}
        total={total}
        state={table}
        isLoading={false}
        isFetching={isStale || isPending}
        isError={false}
        refetch={() => router.refresh()}
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
      <CourseFormSheet open={sheetOpen} onOpenChange={setSheetOpen} course={editing} />

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(o) => {
          if (!o) setToDelete(null);
        }}
        title="Delete course?"
        description={
          toDelete ? (
            <>
              This permanently deletes{" "}
              <span className="font-medium text-ink">{toDelete.title}</span>, along with its modules
              and lessons. This can&apos;t be undone.
            </>
          ) : null
        }
        confirmLabel="Delete course"
        destructive
        pending={isPending}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

export function CoursesTable(props: { rows: Course[]; total: number; params: ListParams }) {
  // `useDataTable` reads `useSearchParams()`, which requires a Suspense boundary.
  return (
    <React.Suspense fallback={null}>
      <CoursesTableInner {...props} />
    </React.Suspense>
  );
}
