"use client";

import type { ReactNode } from "react";
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
import { GripVertical } from "lucide-react";

import { cn } from "@/lib/utils";

const MODIFIERS = [restrictToVerticalAxis, restrictToParentElement];

export function SortableList<T>({
  items,
  idOf,
  onReorder,
  children,
}: {
  items: T[];
  idOf: (item: T) => string;
  onReorder: (next: T[]) => void;
  children: ReactNode;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const from = items.findIndex((item) => idOf(item) === active.id);
    const to = items.findIndex((item) => idOf(item) === over.id);
    if (from === -1 || to === -1) return;
    onReorder(arrayMove(items, from, to));
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={MODIFIERS}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={items.map(idOf)} strategy={verticalListSortingStrategy}>
        <ul role="list" className="flex flex-col gap-2">
          {children}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

export function SortableRow({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-center gap-2 rounded-card border border-line bg-surface py-1.5 pr-1.5 pl-1.5",
        isDragging && "relative z-10 shadow-lg",
      )}
    >
      <button
        type="button"
        aria-label={`Reorder ${label}`}
        className="grid size-7 shrink-0 cursor-grab touch-none place-items-center rounded-md text-ink-4 outline-none hover:bg-hover hover:text-ink-2 focus-visible:ring-2 focus-visible:ring-ring/40 active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>
      {children}
    </li>
  );
}
