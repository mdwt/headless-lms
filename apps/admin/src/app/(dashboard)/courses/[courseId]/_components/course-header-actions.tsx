"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { RowActions } from "@/components/data-table/row-actions";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { usePermissions } from "@/lib/auth/permissions-context";
import type { Course } from "@/lib/api/types";

import { deleteCourseAction } from "../../actions";
import { duplicateCourseAction, setCoursePublishedAction } from "../actions";

export function CourseHeaderActions({
  courseId,
  title,
  status,
}: {
  courseId: string;
  title: string;
  status: Course["status"];
}) {
  const permissions = usePermissions();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const canPublish = permissions.has("courses:write", courseId);
  const canDuplicate = permissions.has("courses:write");
  const canDelete = permissions.has("courses:delete", courseId);
  if (!canPublish && !canDuplicate && !canDelete) return null;

  function onTogglePublish() {
    const next: Course["status"] = status === "published" ? "draft" : "published";
    startTransition(async () => {
      try {
        await setCoursePublishedAction(courseId, next);
        toast.success(next === "published" ? "Course published" : "Moved to draft");
      } catch (e) {
        toast.error("Couldn't update status", { description: (e as Error).message });
        router.refresh();
      }
    });
  }

  function onDuplicate() {
    startTransition(async () => {
      try {
        const copy = await duplicateCourseAction(courseId);
        toast.success("Course duplicated");
        router.push(`/courses/${copy.id}`);
      } catch (e) {
        toast.error("Couldn't duplicate course", { description: (e as Error).message });
      }
    });
  }

  function onConfirmDelete() {
    startTransition(async () => {
      try {
        await deleteCourseAction(courseId);
        toast.success("Course deleted");
        router.push("/courses");
      } catch (e) {
        toast.error("Couldn't delete course", { description: (e as Error).message });
      }
    });
  }

  return (
    <div className="flex shrink-0 items-center gap-2">
      <RowActions label="Course actions">
        {canPublish && (
          <DropdownMenuItem onClick={onTogglePublish} disabled={isPending}>
            {status === "published" ? "Unpublish" : "Publish"}
          </DropdownMenuItem>
        )}
        {canDuplicate && (
          <DropdownMenuItem onClick={onDuplicate} disabled={isPending}>
            Duplicate
          </DropdownMenuItem>
        )}
        {canDelete && (
          <>
            {(canPublish || canDuplicate) && <DropdownMenuSeparator />}
            <DropdownMenuItem variant="danger" onClick={() => setConfirmingDelete(true)}>
              Delete
            </DropdownMenuItem>
          </>
        )}
      </RowActions>

      <ConfirmDialog
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
        title="Delete course?"
        description={
          <>
            This permanently deletes <span className="font-medium text-ink">{title}</span>, along
            with its modules and lessons. This can&apos;t be undone.
          </>
        }
        confirmLabel="Delete course"
        destructive
        pending={isPending}
        onConfirm={onConfirmDelete}
      />
    </div>
  );
}
