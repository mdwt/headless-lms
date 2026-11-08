"use client";

import { useRef, useState, useTransition } from "react";
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
import { File as FileIcon, GripVertical, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RowActions } from "@/components/data-table/row-actions";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ApiError } from "@/lib/api/http";
import { formatBytes } from "@/lib/format";
import type { EventFile } from "@/lib/api/types";
import { cn } from "@/lib/utils";

import { confirmAssetAction, requestUploadAction } from "../../../media/actions";
import { putToStorage } from "../../../media/upload-to-storage";
import {
  addEventAssetAction,
  removeEventAssetAction,
  renameEventAssetAction,
  reorderEventAssetsAction,
} from "../../actions";

function useDndSensors() {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
}

const DND_MODIFIERS = [restrictToVerticalAxis, restrictToParentElement];

function AssetRow({
  asset,
  canEdit,
  onRename,
  onRemove,
}: {
  asset: EventFile;
  canEdit: boolean;
  onRename: (asset: EventFile) => void;
  onRemove: (asset: EventFile) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: asset.assetId,
    disabled: !canEdit,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-center gap-3 rounded-card border border-line bg-surface px-3 py-2.5",
        isDragging && "relative z-10 shadow-lg",
      )}
    >
      {canEdit ? (
        <button
          type="button"
          aria-label="Reorder file"
          className="grid size-7 shrink-0 cursor-grab touch-none place-items-center rounded-md text-ink-4 outline-none transition-colors hover:bg-hover hover:text-ink-2 focus-visible:ring-2 focus-visible:ring-ring/40 active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
      ) : null}

      <FileIcon className="size-4 shrink-0 text-ink-4" />

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-medium text-ink">
          {asset.displayName ?? asset.filename}
        </span>
        <span className="text-xs text-ink-4">
          {asset.contentType} · {formatBytes(asset.size)}
        </span>
      </div>

      {canEdit ? (
        <RowActions label="File actions">
          <DropdownMenuItem onClick={() => onRename(asset)}>Rename</DropdownMenuItem>
          <DropdownMenuItem variant="danger" onClick={() => onRemove(asset)}>
            Remove
          </DropdownMenuItem>
        </RowActions>
      ) : null}
    </div>
  );
}

function RenameDialog({
  asset,
  pending,
  onOpenChange,
  onSave,
}: {
  asset: EventFile | null;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (displayName: string | null) => void;
}) {
  const [name, setName] = useState("");
  const [syncedAssetId, setSyncedAssetId] = useState<string | null>(null);

  if (asset && asset.assetId !== syncedAssetId) {
    setSyncedAssetId(asset.assetId);
    setName(asset.displayName ?? "");
  } else if (!asset && syncedAssetId !== null) {
    setSyncedAssetId(null);
  }

  return (
    <Dialog open={asset !== null} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent className="max-w-sm" showCloseButton={!pending}>
        <DialogHeader>
          <DialogTitle>Rename file</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const trimmed = name.trim();
            onSave(trimmed === "" ? null : trimmed);
          }}
          className="flex flex-col gap-4"
        >
          <Field
            id="asset-display-name"
            label="Name"
            hint="Leave blank to use the original filename."
          >
            <Input
              id="asset-display-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={asset?.filename}
            />
          </Field>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EventFilesPanel({
  eventId,
  assets: initialAssets,
  canEdit,
}: {
  eventId: string;
  assets: EventFile[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const sensors = useDndSensors();
  const [isPending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [assets, setAssets] = useState<EventFile[]>(initialAssets);
  const [serverAssets, setServerAssets] = useState<EventFile[]>(initialAssets);
  const [renaming, setRenaming] = useState<EventFile | null>(null);
  const [removing, setRemoving] = useState<EventFile | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  if (initialAssets !== serverAssets) {
    setServerAssets(initialAssets);
    setAssets(initialAssets);
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = assets.findIndex((a) => a.assetId === active.id);
    const newIndex = assets.findIndex((a) => a.assetId === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const next = arrayMove(assets, oldIndex, newIndex);
    setAssets(next);
    startTransition(async () => {
      try {
        const updated = await reorderEventAssetsAction(
          eventId,
          next.map((a) => a.assetId),
        );
        setAssets(updated);
      } catch (err) {
        toast.error("Something went wrong", { description: (err as Error).message });
        router.refresh();
      }
    });
  }

  async function onFileSelected(file: File) {
    setAdding(true);
    try {
      const ticket = await requestUploadAction({
        filename: file.name,
        contentType: file.type || "application/octet-stream",
        contentId: eventId,
      });
      await putToStorage(ticket.uploadUrl, ticket.headers ?? {}, file);
      await confirmAssetAction(ticket.asset.id);
      const updated = await addEventAssetAction(eventId, ticket.asset.id);
      setAssets(updated);
      toast.success("File added");
    } catch (e) {
      toast.error("Couldn't add file", {
        description: e instanceof ApiError ? e.message : (e as Error).message,
      });
    } finally {
      setAdding(false);
    }
  }

  function onSaveRename(displayName: string | null) {
    if (!renaming) return;
    const assetId = renaming.assetId;
    startTransition(async () => {
      try {
        const updated = await renameEventAssetAction(eventId, assetId, displayName);
        setAssets(updated);
        toast.success("File renamed");
        setRenaming(null);
      } catch (err) {
        toast.error("Couldn't rename file", { description: (err as Error).message });
      }
    });
  }

  function onConfirmRemove() {
    if (!removing) return;
    const assetId = removing.assetId;
    startTransition(async () => {
      try {
        const updated = await removeEventAssetAction(eventId, assetId);
        setAssets(updated);
        toast.success("File removed");
        setRemoving(null);
      } catch (err) {
        toast.error("Couldn't remove file", { description: (err as Error).message });
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void onFileSelected(file);
        }}
      />

      {assets.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-line bg-surface-2 px-6 py-12 text-center">
          <p className="text-sm font-medium text-ink">No files yet</p>
          <p className="max-w-sm text-sm text-ink-3 text-pretty">
            Add the files attendees get with the event, such as slides or a worksheet.
          </p>
          {canEdit ? (
            <Button variant="secondary" onClick={() => inputRef.current?.click()} disabled={adding}>
              {adding ? <Loader2 className="animate-spin" /> : <Plus className="size-4" />}
              Add file
            </Button>
          ) : null}
        </div>
      ) : (
        <>
          <DndContext
            id="event-assets"
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={DND_MODIFIERS}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={assets.map((a) => a.assetId)}
              strategy={verticalListSortingStrategy}
            >
              <div className="flex flex-col gap-2">
                {assets.map((asset) => (
                  <AssetRow
                    key={asset.assetId}
                    asset={asset}
                    canEdit={canEdit}
                    onRename={setRenaming}
                    onRemove={setRemoving}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          {canEdit ? (
            <div className="pt-1">
              <Button
                variant="secondary"
                onClick={() => inputRef.current?.click()}
                disabled={adding}
              >
                {adding ? <Loader2 className="animate-spin" /> : <Plus className="size-4" />}
                Add file
              </Button>
            </div>
          ) : null}
        </>
      )}

      <RenameDialog
        asset={renaming}
        pending={isPending}
        onOpenChange={(open) => !open && setRenaming(null)}
        onSave={onSaveRename}
      />

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Remove file?"
        description={
          <>
            Remove{" "}
            <span className="font-medium text-ink">
              {removing?.displayName ?? removing?.filename}
            </span>{" "}
            from this event? The file stays in the media library. This can&apos;t be undone.
          </>
        }
        confirmLabel="Remove file"
        pending={isPending}
        onConfirm={onConfirmRemove}
      />
    </div>
  );
}
