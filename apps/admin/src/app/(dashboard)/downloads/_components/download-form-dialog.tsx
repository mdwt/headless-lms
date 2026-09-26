"use client";

import { useEffect, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { FormDialog } from "@/components/forms/form-dialog";
import { Field } from "@/components/forms/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

import { createDownloadAction, updateDownloadAction } from "../actions";
import type { Download } from "@/lib/api/types";

const schema = z.object({
  title: z.string().trim().min(1, "Title is required").max(120, "Keep it under 120 characters"),
  category: z.string().trim().max(60, "Keep it under 60 characters").optional(),
  description: z.string().trim().max(600, "Keep it under 600 characters").optional(),
});

type FormValues = z.infer<typeof schema>;

const FORM_ID = "download-form";

export function DownloadFormDialog({
  open,
  onOpenChange,
  download,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present = edit mode; absent = create mode. */
  download?: Download;
}) {
  const isEdit = Boolean(download);
  const [pending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: "",
      category: "",
      description: "",
    },
  });

  // Re-seed the form whenever the sheet opens (for the active download or a
  // blank create). Key on the stable `download?.id`, NOT the whole `download`
  // object — a list revalidation while the sheet is open streams a new
  // `download` reference with identical data, and depending on it would wipe
  // in-progress edits.
  useEffect(() => {
    if (!open) return;
    reset({
      title: download?.title ?? "",
      category: download?.category ?? "",
      description: download?.description ?? "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, download?.id]);

  const onSubmit = handleSubmit((values) => {
    const input = {
      title: values.title.trim(),
      category: values.category?.trim() ?? "",
      description: values.description?.trim() ?? "",
    };
    startTransition(async () => {
      try {
        if (isEdit && download) await updateDownloadAction(download.id, input);
        else await createDownloadAction(input);
        toast.success(isEdit ? "Changes saved" : "Download created");
        onOpenChange(false);
      } catch (e) {
        toast.error(isEdit ? "Couldn't Save" : "Couldn't create download", {
          description: (e as Error).message,
        });
      }
    });
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? "Edit download" : "New download"}
      formId={FORM_ID}
      submitLabel={isEdit ? "Save" : "Create download"}
      pending={pending}
    >
      <form id={FORM_ID} onSubmit={onSubmit} className="flex flex-col gap-5">
        <Field id="title" label="Title" required error={errors.title?.message}>
          <Input
            id="title"
            placeholder="e.g. Onboarding Toolkit"
            aria-invalid={Boolean(errors.title)}
            {...register("title")}
          />
        </Field>

        <Field id="category" label="Category" error={errors.category?.message}>
          <Input
            id="category"
            placeholder="e.g. Templates"
            aria-invalid={Boolean(errors.category)}
            {...register("category")}
          />
        </Field>

        <Field
          id="description"
          label="Description"
          error={errors.description?.message}
          hint="A short summary shown on the download card."
        >
          <Textarea
            id="description"
            rows={4}
            placeholder="What's included in this download?"
            aria-invalid={Boolean(errors.description)}
            {...register("description")}
          />
        </Field>
      </form>
    </FormDialog>
  );
}
