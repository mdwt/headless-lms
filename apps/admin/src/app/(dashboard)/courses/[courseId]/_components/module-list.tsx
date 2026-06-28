"use client";

import * as React from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { restrictToParentElement, restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { CSS } from "@dnd-kit/utilities";
import { Check, FileText, GripVertical, ListChecks, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RowActions } from "@/components/data-table/row-actions";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  useCreateModule,
  useDeleteModule,
  useReorderItems,
  useReorderModules,
  useUpdateModule,
} from "@/lib/api/hooks";
import type { Module, ModuleItem } from "@/lib/api/types";
import { cn } from "@/lib/utils";

import { ItemRow } from "./item-row";
import { ItemFormSheet } from "./item-form-sheet";

function useDndSensors() {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
}

const DND_MODIFIERS = [restrictToVerticalAxis, restrictToParentElement];

// ---------------------------------------------------------------------------
// One module: sortable card + its own item DnD context.
// ---------------------------------------------------------------------------

function SortableModule({
  module,
  courseId,
  index,
  canEdit,
}: {
  module: Module;
  courseId: string;
  index: number;
  canEdit: boolean;
}) {
  const updateModule = useUpdateModule(courseId);
  const deleteModule = useDeleteModule(courseId);
  const reorderItems = useReorderItems(courseId);
  const sensors = useDndSensors();

  const [items, setItems] = React.useState<ModuleItem[]>(module.items);
  const [serverItems, setServerItems] = React.useState<ModuleItem[]>(module.items);
  const [editingTitle, setEditingTitle] = React.useState(false);
  const [titleDraft, setTitleDraft] = React.useState(module.title);
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [sheetItem, setSheetItem] = React.useState<ModuleItem | null>(null);
  const [sheetKind, setSheetKind] = React.useState<"lesson" | "assessment">("lesson");

  // Re-sync local ordering when the server returns a new item set.
  if (module.items !== serverItems) {
    setServerItems(module.items);
    setItems(module.items);
  }

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: module.id,
    disabled: !canEdit,
  });

  function handleItemDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const next = arrayMove(items, oldIndex, newIndex);
    setItems(next);
    reorderItems.mutate({ moduleId: module.id, orderedIds: next.map((i) => i.id) });
  }

  function saveTitle() {
    const next = titleDraft.trim();
    setEditingTitle(false);
    if (!next || next === module.title) {
      setTitleDraft(module.title);
      return;
    }
    updateModule.mutate({ moduleId: module.id, title: next });
  }

  function openCreate(kind: "lesson" | "assessment") {
    setSheetItem(null);
    setSheetKind(kind);
    setSheetOpen(true);
  }

  function openEdit(item: ModuleItem) {
    setSheetItem(item);
    setSheetKind(item.kind);
    setSheetOpen(true);
  }

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "rounded-card border border-line bg-surface",
        isDragging && "relative z-10 shadow-lg",
      )}
    >
      <div className="flex items-center gap-3 border-b border-line px-3 py-2.5">
        {canEdit ? (
          <button
            type="button"
            aria-label="Reorder module"
            className="grid size-7 shrink-0 cursor-grab touch-none place-items-center rounded-md text-ink-4 outline-none transition-colors hover:bg-hover hover:text-ink-2 focus-visible:ring-2 focus-visible:ring-ring/40 active:cursor-grabbing"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-4" />
          </button>
        ) : (
          <span className="w-7 shrink-0" aria-hidden />
        )}

        <span className="grid size-6 shrink-0 place-items-center rounded-md bg-surface-2 text-xs font-medium text-ink-3 tabular-nums">
          {index + 1}
        </span>

        {editingTitle ? (
          <div className="flex flex-1 items-center gap-1.5">
            <Input
              value={titleDraft}
              autoFocus
              onChange={(e) => setTitleDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveTitle();
                if (e.key === "Escape") {
                  setTitleDraft(module.title);
                  setEditingTitle(false);
                }
              }}
              className="h-8"
            />
            <Button size="icon-sm" variant="ghost" aria-label="Save title" onClick={saveTitle}>
              <Check className="size-4" />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Cancel"
              onClick={() => {
                setTitleDraft(module.title);
                setEditingTitle(false);
              }}
            >
              <X className="size-4" />
            </Button>
          </div>
        ) : (
          <button
            type="button"
            disabled={!canEdit}
            onClick={() => canEdit && setEditingTitle(true)}
            className={cn(
              "min-w-0 flex-1 truncate rounded-md py-1 text-left text-sm font-medium text-ink outline-none",
              canEdit && "hover:text-brand focus-visible:ring-2 focus-visible:ring-ring/40",
            )}
          >
            {module.title}
          </button>
        )}

        <span className="shrink-0 text-xs text-ink-4 tabular-nums">
          {module.items.length} {module.items.length === 1 ? "item" : "items"}
        </span>

        {canEdit ? (
          <RowActions label="Module actions">
            <DropdownMenuItem onClick={() => setEditingTitle(true)}>Rename</DropdownMenuItem>
            <DropdownMenuItem onClick={() => openCreate("lesson")}>Add lesson</DropdownMenuItem>
            <DropdownMenuItem onClick={() => openCreate("assessment")}>
              Add assessment
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="danger" onClick={() => setConfirmOpen(true)}>
              Delete module
            </DropdownMenuItem>
          </RowActions>
        ) : null}
      </div>

      <div className="px-2 py-2">
        {items.length === 0 ? (
          <p className="px-2 py-4 text-center text-sm text-ink-4">
            No content yet{canEdit ? " — add a lesson or assessment below." : "."}
          </p>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={DND_MODIFIERS}
            onDragEnd={handleItemDragEnd}
          >
            <SortableContext
              items={items.map((i) => i.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="flex flex-col gap-0.5">
                {items.map((item) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    courseId={courseId}
                    moduleId={module.id}
                    canEdit={canEdit}
                    onEdit={openEdit}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}

        {canEdit ? (
          <div className="flex items-center gap-2 px-1 pt-2">
            <Button size="sm" variant="ghost" onClick={() => openCreate("lesson")}>
              <FileText className="size-4" />
              Add lesson
            </Button>
            <Button size="sm" variant="ghost" onClick={() => openCreate("assessment")}>
              <ListChecks className="size-4" />
              Add assessment
            </Button>
          </div>
        ) : null}
      </div>

      {canEdit ? (
        <>
          <ItemFormSheet
            open={sheetOpen}
            onOpenChange={setSheetOpen}
            courseId={courseId}
            moduleId={module.id}
            item={sheetItem}
            defaultKind={sheetKind}
          />
          <ConfirmDialog
            open={confirmOpen}
            onOpenChange={setConfirmOpen}
            title="Delete module"
            description={
              <>
                Delete <span className="font-medium text-ink">{module.title}</span> and its{" "}
                {module.items.length} {module.items.length === 1 ? "item" : "items"}? This can&apos;t
                be undone.
              </>
            }
            confirmLabel="Delete module"
            pending={deleteModule.isPending}
            onConfirm={async () => {
              try {
                await deleteModule.mutateAsync(module.id);
                setConfirmOpen(false);
              } catch {
                /* toast handled by hook */
              }
            }}
          />
        </>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline "Add module" composer.
// ---------------------------------------------------------------------------

function ModuleComposer({ courseId }: { courseId: string }) {
  const createModule = useCreateModule(courseId);
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState("");

  function submit() {
    const next = title.trim();
    if (!next) return;
    createModule.mutate(next, {
      onSuccess: () => {
        setTitle("");
        setOpen(false);
      },
    });
  }

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        Add module
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-card border border-line bg-surface p-2">
      <Input
        value={title}
        autoFocus
        placeholder="Module title"
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") {
            setTitle("");
            setOpen(false);
          }
        }}
      />
      <Button
        variant="primary"
        onClick={submit}
        disabled={!title.trim() || createModule.isPending}
      >
        Add
      </Button>
      <Button
        variant="ghost"
        onClick={() => {
          setTitle("");
          setOpen(false);
        }}
        disabled={createModule.isPending}
      >
        Cancel
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The list: sortable modules + composer.
// ---------------------------------------------------------------------------

export function ModuleList({
  courseId,
  modules,
  canEdit,
}: {
  courseId: string;
  modules: Module[];
  canEdit: boolean;
}) {
  const reorderModules = useReorderModules(courseId);
  const sensors = useDndSensors();
  const [ordered, setOrdered] = React.useState<Module[]>(modules);
  const [serverModules, setServerModules] = React.useState<Module[]>(modules);

  // Re-sync local ordering when the server returns a new module set.
  if (modules !== serverModules) {
    setServerModules(modules);
    setOrdered(modules);
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = ordered.findIndex((m) => m.id === active.id);
    const newIndex = ordered.findIndex((m) => m.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const next = arrayMove(ordered, oldIndex, newIndex);
    setOrdered(next);
    reorderModules.mutate(next.map((m) => m.id));
  }

  if (ordered.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-line bg-surface-2 px-6 py-12 text-center">
        <p className="text-sm font-medium text-ink">No modules yet</p>
        <p className="max-w-sm text-sm text-ink-3 text-pretty">
          {canEdit
            ? "Start building this course by adding your first module."
            : "This course doesn't have any content yet."}
        </p>
        {canEdit ? <ModuleComposer courseId={courseId} /> : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {canEdit ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={DND_MODIFIERS}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={ordered.map((m) => m.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="flex flex-col gap-3">
              {ordered.map((module, i) => (
                <SortableModule
                  key={module.id}
                  module={module}
                  index={i}
                  courseId={courseId}
                  canEdit={canEdit}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <div className="flex flex-col gap-3">
          {ordered.map((module, i) => (
            <SortableModule
              key={module.id}
              module={module}
              index={i}
              courseId={courseId}
              canEdit={canEdit}
            />
          ))}
        </div>
      )}

      {canEdit ? (
        <div className="pt-1">
          <ModuleComposer courseId={courseId} />
        </div>
      ) : null}
    </div>
  );
}
