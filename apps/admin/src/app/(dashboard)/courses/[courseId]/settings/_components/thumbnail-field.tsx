"use client";

/**
 * Settings → Thumbnail: pick the course's cover, either by uploading a new
 * image or by linking one already in the media library. Nothing is copied —
 * the course stores the asset id and pages re-sign a fresh URL at render time,
 * so the preview URL held here is only good for this session.
 */

import { useRef, useState } from "react";
import { ImageIcon, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { SettingsSection } from "@/components/forms/settings-section";
import { Button } from "@/components/ui/button";
import { AssetPickerDialog } from "@/app/(dashboard)/media/_components/asset-picker-dialog";
import {
  confirmAssetAction,
  getAssetUrlAction,
  requestUploadAction,
} from "@/app/(dashboard)/media/actions";
import { putToStorage } from "@/app/(dashboard)/media/upload-to-storage";
import type { Asset } from "@/lib/api/types";

import { setCourseThumbnailAction } from "../actions";

export function ThumbnailField({
  courseId,
  assetId,
  url,
}: {
  courseId: string;
  assetId: string | null;
  /** Presigned preview URL for `assetId`, resolved on the server. */
  url: string | null;
}) {
  const [preview, setPreview] = useState<{ id: string; url: string } | null>(
    assetId && url ? { id: assetId, url } : null,
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState<"upload" | "save" | null>(null);
  const [progress, setProgress] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);

  async function save(next: { id: string; url: string } | null) {
    const rollback = preview;
    setPreview(next);
    setBusy("save");
    try {
      await setCourseThumbnailAction(courseId, next?.id ?? null);
      toast.success(next ? "Thumbnail updated" : "Thumbnail removed");
    } catch (err) {
      setPreview(rollback);
      toast.error("Could not save", { description: (err as Error).message });
    } finally {
      setBusy(null);
    }
  }

  async function onSelect(asset: Asset) {
    setPickerOpen(false);
    try {
      const signed = await getAssetUrlAction(asset.id, asset.filename);
      await save({ id: asset.id, url: signed });
    } catch (err) {
      toast.error("Couldn't use that file", { description: (err as Error).message });
    }
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
      });
      await putToStorage(ticket.uploadUrl, ticket.headers, file, setProgress);
      await confirmAssetAction(ticket.asset.id);
      const signed = await getAssetUrlAction(ticket.asset.id, file.name);
      await save({ id: ticket.asset.id, url: signed });
    } catch (err) {
      toast.error("Upload failed", { description: (err as Error).message });
      setBusy(null);
    }
  }

  const uploading = busy === "upload";
  const disabled = busy !== null;

  return (
    <SettingsSection
      title="Thumbnail"
      description="The cover image for this course. Upload a new one or link an image already in your media library."
    >
      <div className="flex flex-col gap-4">
        <div className="relative grid aspect-video w-56 shrink-0 place-items-center overflow-hidden rounded-card border border-line bg-well">
          {preview ? (
            // Presigned URLs are short-lived and host-varying — next/image would
            // need every storage host allowlisted, so this stays a plain img.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview.url} alt="" className="size-full object-cover" />
          ) : (
            <ImageIcon className="size-6 text-ink-4" aria-hidden />
          )}
          {uploading && (
            <div className="absolute inset-0 grid place-items-center gap-2 bg-surface/80 text-xs text-ink-3">
              <Loader2 className="size-4 animate-spin" />
              {Math.round(progress * 100)}%
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
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
              disabled={disabled}
              onClick={() => fileInput.current?.click()}
            >
              <Upload />
              Upload
            </Button>
            <Button
              type="button"
              variant="secondary"
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
                disabled={disabled}
                onClick={() => void save(null)}
              >
                <Trash2 />
                Remove
              </Button>
            )}
          </div>
          <p className="text-sm text-ink-3">
            A wide image works best — it is cropped to 16:9 on the course card.
          </p>
        </div>

        <AssetPickerDialog
          open={pickerOpen}
          kind="image"
          onOpenChange={setPickerOpen}
          onSelect={onSelect}
        />
      </div>
    </SettingsSection>
  );
}
