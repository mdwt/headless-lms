"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { ChevronRight, GripVertical, LayoutList, Plus } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Space } from "@/lib/api/types";
import { cn } from "@/lib/utils";

import { reorderSpacesAction } from "../../../../actions";
import { SpaceAccessBadge } from "../../../_components/space-access";
import { SpaceFormDialog } from "../../../_components/space-form-dialog";

const DND_MODIFIERS = [restrictToVerticalAxis, restrictToParentElement];

export function SpaceList({
  communityId,
  spaces: initial,
}: {
  communityId: string;
  spaces: Space[];
}) {
  const router = useRouter();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const [spaces, setSpaces] = useState(initial);
  const [serverSpaces, setServerSpaces] = useState(initial);
  const [creating, setCreating] = useState(false);
  const [, startTransition] = useTransition();

  if (initial !== serverSpaces) {
    setServerSpaces(initial);
    setSpaces(initial);
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const from = spaces.findIndex((s) => s.id === active.id);
    const to = spaces.findIndex((s) => s.id === over.id);
    if (from === -1 || to === -1) return;
    const next = arrayMove(spaces, from, to);
    setSpaces(next);
    startTransition(async () => {
      try {
        await reorderSpacesAction(
          communityId,
          next.map((s) => s.id),
        );
      } catch (err) {
        toast.error("Couldn't reorder spaces", { description: (err as Error).message });
        router.refresh();
      }
    });
  }

  return (
    <section className="flex flex-col gap-5">
      {spaces.length === 0 ? (
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-line px-6 text-center">
          <LayoutList className="size-5 text-ink-3" aria-hidden />
          <div className="flex flex-col gap-1.5">
            <h2 className="text-base font-medium tracking-tight text-ink">No spaces yet</h2>
            <p className="max-w-[44ch] text-sm text-pretty text-ink-3">
              Spaces are where members post. Add one for each thing people come to do, such as
              announcements, introductions or questions.
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => setCreating(true)}>
            <Plus />
            New space
          </Button>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-ink-3">
              Members see the spaces in this order. Drag to reorder.
            </p>
            <Button variant="secondary" size="sm" onClick={() => setCreating(true)}>
              <Plus />
              New space
            </Button>
          </div>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={DND_MODIFIERS}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={spaces.map((s) => s.id)} strategy={verticalListSortingStrategy}>
              <ul role="list" className="flex flex-col gap-2">
                {spaces.map((space) => (
                  <SpaceRow key={space.id} communityId={communityId} space={space} />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        </>
      )}

      <SpaceFormDialog communityId={communityId} open={creating} onOpenChange={setCreating} />
    </section>
  );
}

function SpaceRow({ communityId, space }: { communityId: string; space: Space }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: space.id,
  });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-center gap-3 rounded-card border border-line bg-surface py-3 pr-3 pl-2",
        isDragging && "relative z-10 shadow-lg",
      )}
    >
      <button
        type="button"
        aria-label={`Reorder ${space.name}`}
        className="grid size-7 shrink-0 cursor-grab touch-none place-items-center rounded-md text-ink-4 outline-none hover:bg-hover hover:text-ink-2 focus-visible:ring-2 focus-visible:ring-ring/40 active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>

      <Link
        href={`/communities/${communityId}/spaces/${space.id}`}
        className="group flex min-w-0 flex-1 items-center gap-4 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="truncate text-sm font-medium text-ink group-hover:text-brand">
              {space.name}
            </p>
            {space.description ? (
              <p className="truncate text-sm text-ink-4">{space.description}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <SpaceAccessBadge rule={space.accessRule} />
            {space.capacity !== null && (
              <Badge variant="outline" className="tabular-nums">
                {space.capacity} {space.capacity === 1 ? "seat" : "seats"}
              </Badge>
            )}
            {space.settings.requireReview && <Badge variant="warning">Posts reviewed</Badge>}
            {!space.settings.comments && <Badge variant="neutral">Comments off</Badge>}
            {!space.settings.reactions && <Badge variant="neutral">Reactions off</Badge>}
            {space.topics.length > 0 && (
              <Badge variant="outline" className="tabular-nums">
                {space.topics.length} {space.topics.length === 1 ? "topic" : "topics"}
              </Badge>
            )}
            {space.links.length > 0 && (
              <Badge variant="outline" className="tabular-nums">
                {space.links.length} {space.links.length === 1 ? "link" : "links"}
              </Badge>
            )}
          </div>
        </div>
        <ChevronRight className="size-4 shrink-0 text-ink-4" aria-hidden />
      </Link>
    </li>
  );
}
