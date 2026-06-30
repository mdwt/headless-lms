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
  ListChecks,
  Pencil,
  Trash2,
  Video,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { RowActions } from "@/components/data-table/row-actions";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useDeleteItem, useSaveItem } from "@/lib/api/hooks";
import type { ModuleItem } from "@/lib/api/types";
import { cn } from "@/lib/utils";

function ItemGlyph({ item }: { item: ModuleItem }) {
  const cls = "size-4";
  if (item.kind === "assessment") {
    return item.assessment.type === "quiz" ? (
      <ListChecks className={cls} />
    ) : (
      <ClipboardList className={cls} />
    );
  }
  switch (item.lesson.type) {
    case "video":
      return <Video className={cls} />;
    case "audio":
      return <Headphones className={cls} />;
    case "download":
      return <Download className={cls} />;
    case "embed":
      return <Code2 className={cls} />;
    case "pdf":
    case "text":
    default:
      return <FileText className={cls} />;
  }
}

function ItemIcon({ item }: { item: ModuleItem }) {
  return (
    <span className="grid size-7 shrink-0 place-items-center rounded-md bg-surface-2 text-ink-3">
      <ItemGlyph item={item} />
    </span>
  );
}

function metaFor(item: ModuleItem): { label: string; detail?: string } {
  if (item.kind === "assessment") {
    if (item.assessment.type === "quiz") {
      return {
        label: "Quiz",
        detail:
          item.assessment.questionCount != null
            ? `${item.assessment.questionCount} questions`
            : undefined,
      };
    }
    return {
      label: "Assignment",
      detail:
        item.assessment.pointsPossible != null
          ? `${item.assessment.pointsPossible} pts`
          : undefined,
    };
  }
  const type = item.lesson.type;
  const label = type.charAt(0).toUpperCase() + type.slice(1);
  return { label };
}

export function ItemRow({
  item,
  courseId,
  moduleId,
  canEdit,
  onEdit,
}: {
  item: ModuleItem;
  courseId: string;
  moduleId: string;
  canEdit: boolean;
  onEdit: (item: ModuleItem) => void;
}) {
  const save = useSaveItem(courseId);
  const del = useDeleteItem(courseId);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  // Only assessments carry a published flag; lessons have none.
  const itemPublished = item.kind === "assessment" ? item.assessment.published : false;
  const [published, setPublished] = React.useState(itemPublished);
  const [serverPublished, setServerPublished] = React.useState(itemPublished);

  // Sync optimistic state when the server value changes (no effect needed).
  if (itemPublished !== serverPublished) {
    setServerPublished(itemPublished);
    setPublished(itemPublished);
  }

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: !canEdit,
  });

  const meta = metaFor(item);
  const title = item.kind === "assessment" ? item.assessment.title : item.lesson.title;

  function togglePublished(next: boolean) {
    if (item.kind !== "assessment") return;
    setPublished(next);
    // Rebuild the full assessment payload so the SDK sends a complete body.
    save.mutate(
      {
        moduleId,
        item: {
          id: item.id,
          kind: "assessment",
          title: item.assessment.title,
          type: item.assessment.type,
          questionCount: item.assessment.questionCount,
          pointsPossible: item.assessment.pointsPossible,
          published: next,
        },
      },
      { onError: () => setPublished(serverPublished) },
    );
  }

  async function confirmDelete() {
    try {
      await del.mutateAsync({ moduleId, itemId: item.id });
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

      <ItemIcon item={item} />

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-medium text-ink">{title}</span>
        <div className="flex items-center gap-1.5 text-xs text-ink-4">
          <span>{meta.label}</span>
          {meta.detail ? (
            <>
              <span aria-hidden>·</span>
              <span>{meta.detail}</span>
            </>
          ) : null}
        </div>
      </div>

      {item.kind === "assessment" ? (
        canEdit ? (
          <Switch
            checked={published}
            onCheckedChange={togglePublished}
            aria-label={published ? "Published — click to unpublish" : "Draft — click to publish"}
            className="shrink-0"
          />
        ) : (
          <Badge variant={published ? "success" : "neutral"}>
            {published ? "Published" : "Draft"}
          </Badge>
        )
      ) : null}

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
        title="Delete item"
        description={
          <>
            Delete <span className="font-medium text-ink">{title}</span>? This can&apos;t be
            undone.
          </>
        }
        confirmLabel="Delete item"
        pending={del.isPending}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
