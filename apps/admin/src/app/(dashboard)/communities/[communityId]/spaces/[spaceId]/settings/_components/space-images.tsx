"use client";

import { useRef, useState } from "react";
import { ImageIcon, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Field } from "@/components/forms/field";
import { SettingsSection } from "@/components/forms/settings-section";
import { Button } from "@/components/ui/button";
import { AssetPickerDialog } from "@/app/(dashboard)/media/_components/asset-picker-dialog";
import { confirmAssetAction, requestUploadAction } from "@/app/(dashboard)/media/actions";
import { putToStorage } from "@/app/(dashboard)/media/upload-to-storage";
import type { Asset, Space } from "@/lib/api/types";
import { cn } from "@/lib/utils";

import { updateSpaceAction } from "../../../../../actions";

type Slot = {
  field: "coverAssetId" | "backgroundAssetId" | "iconAssetId";
  url: "coverUrl" | "backgroundUrl" | "iconUrl";
  label: string;
  hint: string;
  frame: string;
};

const SLOTS: Slot[] = [
  {
    field: "coverAssetId",
    url: "coverUrl",
    label: "Cover",
    hint: "The banner across the top of the space.",
    frame: "aspect-video w-56",
  },
  {
    field: "backgroundAssetId",
    url: "backgroundUrl",
    label: "Background",
    hint: "The image behind the space's feed.",
    frame: "aspect-video w-56",
  },
  {
    field: "iconAssetId",
    url: "iconUrl",
    label: "Icon",
    hint: "Shown next to the space name. Square images work best.",
    frame: "aspect-square w-20",
  },
];

export function SpaceImages({ communityId, space }: { communityId: string; space: Space }) {
  return (
    <SettingsSection
      title="Images"
      description="How the space looks to members. Upload new images or use images from your media library."
    >
      {SLOTS.map((slot) => (
        <SpaceImage key={slot.field} communityId={communityId} space={space} slot={slot} />
      ))}
    </SettingsSection>
  );
}

function SpaceImage({
  communityId,
  space,
  slot,
}: {
  communityId: string;
  space: Space;
  slot: Slot;
}) {
  const assetId = space[slot.field];
  const url = space[slot.url];
  const [preview, setPreview] = useState<{ id: string; url: string } | null>(
    assetId && url ? { id: assetId, url } : null,
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState<"upload" | "save" | null>(null);
  const [progress, setProgress] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const inputId = `space-${slot.field}`;

  async function save(next: { id: string; url: string } | null) {
    const rollback = preview;
    setPreview(next);
    setBusy("save");
    try {
      await updateSpaceAction(communityId, space.id, { [slot.field]: next?.id ?? null });
      toast.success(next ? `${slot.label} updated` : `${slot.label} removed`);
    } catch (err) {
      setPreview(rollback);
      toast.error("Couldn't save", { description: (err as Error).message });
    } finally {
      setBusy(null);
    }
  }

  async function onSelect(asset: Asset) {
    setPickerOpen(false);
    if (!asset.url) {
      toast.error("Couldn't use that file", { description: `${asset.filename} cannot be shown` });
      return;
    }
    await save({ id: asset.id, url: asset.url });
  }

  async function onUpload(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error("Pick an image file");
      return;
    }
    setBusy("upload");
    setProgress(0);
    try {
      const ticket = await requestUploadAction({
        filename: file.name,
        contentType: file.type,
        contentId: communityId,
      });
      await putToStorage(ticket.uploadUrl, ticket.headers, file, setProgress);
      const asset = await confirmAssetAction(ticket.asset.id);
      if (!asset.url) throw new Error(`${file.name} has not finished uploading`);
      await save({ id: asset.id, url: asset.url });
    } catch (err) {
      toast.error("Upload failed", { description: (err as Error).message });
      setBusy(null);
    }
  }

  const disabled = busy !== null;

  return (
    <Field id={inputId} label={slot.label} hint={slot.hint}>
      <div className="flex flex-col gap-3">
        <div
          className={cn(
            "relative grid shrink-0 place-items-center overflow-hidden rounded-card border border-line bg-well",
            slot.frame,
          )}
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview.url} alt="" className="size-full object-cover" />
          ) : (
            <ImageIcon className="size-6 text-ink-4" aria-hidden />
          )}
          {busy === "upload" && (
            <div className="absolute inset-0 grid place-items-center gap-2 bg-surface/80 text-sm text-ink-3 tabular-nums">
              <Loader2 className="size-4 animate-spin" />
              {Math.round(progress * 100)}%
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            ref={fileInput}
            id={inputId}
            type="file"
            name={slot.field}
            accept="image/*"
            aria-label={`Upload ${slot.label.toLowerCase()}`}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void onUpload(file);
            }}
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={disabled}
            onClick={() => fileInput.current?.click()}
          >
            <Upload />
            Upload
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={disabled}
            onClick={() => setPickerOpen(true)}
          >
            <ImageIcon />
            Choose from library
          </Button>
          {preview && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={() => void save(null)}
            >
              <Trash2 />
              Remove
            </Button>
          )}
        </div>
        <AssetPickerDialog
          open={pickerOpen}
          kind="image"
          onOpenChange={setPickerOpen}
          onSelect={onSelect}
          contentId={communityId}
        />
      </div>
    </Field>
  );
}
