"use client";

import * as React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ClipboardList,
  Code2,
  Download,
  FileText,
  GripVertical,
  Headphones,
  Pencil,
  Trash2,
  Video,
} from "lucide-react";

import { RowActions } from "@/components/data-table/row-actions";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useDeleteActivity } from "@/lib/api/hooks";
import type { Activity, ActivitySettings } from "@/lib/api/types";
import { cn } from "@/lib/utils";

/** Read the opaque settings blob as the admin-side shape. */
function settingsOf(activity: Activity): ActivitySettings {
  return (activity.settings ?? {}) as ActivitySettings;
}

function ActivityGlyph({ type }: { type?: string }) {
  const cls = "size-4";
  switch (type) {
    case "video":
      return <Video className={cls} />;
    case "audio":
      return <Headphones className={cls} />;
    case "download":
      return <Download className={cls} />;
    case "embed":
      return <Code2 className={cls} />;
    case "quiz":
      return <ClipboardList className={cls} />;
    case "pdf":
    case "text":
    default:
      return <FileText className={cls} />;
  }
}

function ActivityIcon({ type }: { type?: string }) {
  return (
    <span className="grid size-7 shrink-0 place-items-center rounded-md bg-surface-2 text-ink-3">
      <ActivityGlyph type={type} />
    </span>
  );
}

function typeLabel(type?: string): string {
  if (!type) return "Activity";
  return type.charAt(0).toUpperCase() + type.slice(1);
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
  const del = useDeleteActivity(courseId);
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: !canEdit,
  });

  const settings = settingsOf(item);
  const title = settings.title?.trim() || "Untitled activity";

  async function confirmDelete() {
    try {
      await del.mutateAsync({ moduleId, activityId: item.id });
      setConfirmOpen(false);
    } catch {
      /* toast handled by hook */
    }
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

      <ActivityIcon type={settings.type} />

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-medium text-ink">{title}</span>
        <div className="flex items-center gap-1.5 text-xs text-ink-4">
          <span>{typeLabel(settings.type)}</span>
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
        pending={del.isPending}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
