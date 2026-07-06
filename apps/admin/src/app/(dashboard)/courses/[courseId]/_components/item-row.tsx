"use client";

import * as React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { FileText, GripVertical, Pencil, Trash2 } from "lucide-react";

import { toast } from "sonner";

import { RowActions } from "@/components/data-table/row-actions";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/confirm-dialog";
import type { Activity, ActivitySettings } from "@/lib/api/types";
import { cn } from "@/lib/utils";

import { deleteActivityAction } from "../actions";

/** Read the opaque settings blob as the admin-side shape. */
function settingsOf(activity: Activity): ActivitySettings {
  return (activity.settings ?? {}) as ActivitySettings;
}

function ActivityIcon() {
  return (
    <span className="grid size-7 shrink-0 place-items-center rounded-md bg-surface-2 text-ink-3">
      <FileText className="size-4" />
    </span>
  );
}

export function ItemRow({
  item,
  courseId,
  moduleId,
  canEdit,
  onEdit,
}: {
  item: Activity;
  courseId: string;
  moduleId: string;
  canEdit: boolean;
  onEdit: (item: Activity) => void;
}) {
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [isPending, startTransition] = React.useTransition();

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: !canEdit,
  });

  const settings = settingsOf(item);
  const title = settings.title?.trim() || "Untitled activity";

  function confirmDelete() {
    startTransition(async () => {
      try {
        await deleteActivityAction(courseId, moduleId, item.id);
        toast.success("Activity deleted");
        setConfirmOpen(false);
      } catch (err) {
        toast.error("Something went wrong", { description: (err as Error).message });
      }
    });
  }

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "group flex items-center gap-3 rounded-md border border-transparent bg-surface px-2 py-2 transition-colors hover:border-line hover:bg-surface-2",
        isDragging && "relative z-10 border-line bg-surface-2 shadow-sm",
      )}
    >
      {canEdit ? (
        <button
          type="button"
          aria-label="Reorder item"
          className="grid size-7 shrink-0 cursor-grab touch-none place-items-center rounded-md text-ink-4 outline-none transition-colors hover:bg-hover hover:text-ink-2 focus-visible:ring-2 focus-visible:ring-ring/40 active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
      ) : (
        <span className="w-7 shrink-0" aria-hidden />
      )}

      <ActivityIcon />

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-medium text-ink">{title}</span>
        <div className="flex items-center gap-1.5 text-xs text-ink-4">
          <span>{settings.published ? "Published" : "Draft"}</span>
        </div>
      </div>

      {canEdit ? (
        <RowActions label="Item actions">
          <DropdownMenuItem onClick={() => onEdit(item)}>
            <Pencil className="size-4" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="danger" onClick={() => setConfirmOpen(true)}>
            <Trash2 className="size-4" />
            Delete
          </DropdownMenuItem>
        </RowActions>
      ) : null}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Delete activity"
        description={
          <>
            Delete <span className="font-medium text-ink">{title}</span>? This can&apos;t be undone.
          </>
        }
        confirmLabel="Delete activity"
        pending={isPending}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
