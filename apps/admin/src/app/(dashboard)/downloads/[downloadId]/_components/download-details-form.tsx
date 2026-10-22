"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { ImageIcon, Loader2 } from "lucide-react";

import { Field } from "@/components/forms/field";
import { SettingsSection, SettingsSurface } from "@/components/forms/settings-section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api/http";
import type { Download } from "@/lib/api/types";

import { confirmAssetAction, getAssetUrlAction, requestUploadAction } from "../../../media/actions";
import { putToStorage } from "../../../media/upload-to-storage";
import { updateDownloadAction } from "../../actions";

const schema = z.object({
  title: z.string().trim().min(1, "A title is required").max(120, "Keep it under 120 characters"),
  category: z.string().trim().max(60, "Keep it under 60 characters").optional(),
  description: z.string().trim().max(600, "Keep the description under 600 characters").optional(),
});

type FormValues = z.infer<typeof schema>;

// Details tab form: edits download metadata inline (title, category,
// description, thumbnail). Mirrors `course-details-form.tsx`; category is
// free text here — there's no fixed download category list.
export function DownloadDetailsForm({ download }: { download: Download }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: download.title,
      category: download.category,
      description: download.description,
    },
  });

  // Re-sync when the server sends a fresh download (after a save revalidates).
  useEffect(() => {
    reset({
      title: download.title,
      category: download.category,
      description: download.description,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [download.id, download.title, download.category, download.description]);

  function onValid(values: FormValues) {
    startTransition(async () => {
      try {
        await updateDownloadAction(download.id, values);
        toast.success("Changes saved");
        router.refresh();
      } catch (err) {
        toast.error("Couldn't Save", { description: (err as Error).message });
      }
    });
  }

  return (
    <SettingsSurface>
      <form onSubmit={handleSubmit(onValid)}>
        <SettingsSection
          footer={
            <Button type="submit" variant="primary" disabled={isPending || !isDirty}>
              {isPending ? "Saving…" : "Save"}
            </Button>
          }
        >
          <Field id="title" label="Title" required error={errors.title?.message}>
            <Input id="title" {...register("title")} />
          </Field>
          <Field id="category" label="Category" error={errors.category?.message}>
            <Input id="category" placeholder="e.g. Templates" {...register("category")} />
          </Field>
          <Field
            id="description"
            label="Description"
            hint="A short summary shown on the download card."
            error={errors.description?.message}
          >
            <Textarea id="description" rows={5} {...register("description")} />
          </Field>

          <ThumbnailField downloadId={download.id} thumbnailAssetId={download.thumbnailAssetId} />
        </SettingsSection>
      </form>
    </SettingsSurface>
  );
}

// No reusable asset picker exists for selecting an existing image, so the
// thumbnail control reuses the media library's own upload flow (request a
// ticket -> PUT to storage -> confirm), then patches the download directly.
// Saves immediately on file select — it doesn't wait for the form submit.
function ThumbnailField({
  downloadId,
  thumbnailAssetId,
}: {
  downloadId: string;
  thumbnailAssetId: string | null;
}) {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!thumbnailAssetId) return;
    let cancelled = false;
    void getAssetUrlAction(thumbnailAssetId)
      .then((u) => {
        if (!cancelled) setUrl(u);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [thumbnailAssetId]);

  async function onFileSelected(file: File) {
    setUploading(true);
    try {
      const ticket = await requestUploadAction({
        filename: file.name,
        contentType: file.type || "application/octet-stream",
      });
      await putToStorage(ticket.uploadUrl, ticket.headers ?? {}, file);
      await confirmAssetAction(ticket.asset.id);
      // Thumbnail-only patch: omit every other field so a concurrent edit to
      // the title/category/description elsewhere isn't clobbered.
      await updateDownloadAction(downloadId, { thumbnailAssetId: ticket.asset.id });
      toast.success("Thumbnail updated");
      router.refresh();
    } catch (e) {
      toast.error("Couldn't update thumbnail", {
        description: e instanceof ApiError ? e.message : (e as Error).message,
      });
    } finally {
      setUploading(false);
    }
  }

  return (
    <Field id="thumbnail" label="Thumbnail" hint="Shown on the download card.">
      <div className="flex items-center gap-4">
        <div className="flex size-20 items-center justify-center overflow-hidden rounded-lg bg-surface-2 outline-1 -outline-offset-1 outline-ink/5">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="" className="size-full object-cover" />
          ) : (
            <ImageIcon className="size-5 text-ink-4" />
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void onFileSelected(file);
          }}
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          {uploading && <Loader2 className="animate-spin" />}
          {thumbnailAssetId ? "Change thumbnail" : "Upload thumbnail"}
        </Button>
      </div>
    </Field>
  );
}
