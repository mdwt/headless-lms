"use client";

import * as React from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { FormSheet } from "@/components/forms/form-sheet";
import { Field } from "@/components/forms/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSaveActivity } from "@/lib/api/hooks";
import type { Activity, ActivitySettings, ActivityType, SaveActivityInput } from "@/lib/api/types";

const ACTIVITY_TYPES: ActivityType[] = [
  "video",
  "text",
  "pdf",
  "audio",
  "download",
  "embed",
  "quiz",
];
const ACTIVITY_TYPE_LABEL: Record<ActivityType, string> = {
  video: "Video",
  text: "Text / article",
  pdf: "PDF",
  audio: "Audio",
  download: "Download",
  embed: "Embed",
  quiz: "Quiz",
};

const schema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Give this activity a title")
    .max(120, "Keep the title under 120 characters"),
  type: z.enum(["video", "text", "pdf", "audio", "download", "embed", "quiz"]),
  published: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

const FORM_ID = "item-form";

/** Read the opaque settings blob as the admin-side shape. */
function settingsOf(activity: Activity | null): ActivitySettings {
  return (activity?.settings ?? {}) as ActivitySettings;
}

function toDefaults(item: Activity | null): FormValues {
  const s = settingsOf(item);
  const type = (s.type ?? "video") as ActivityType;
  return {
    title: s.title ?? "",
    type: ACTIVITY_TYPES.includes(type) ? type : "video",
    published: s.published ?? false,
  };
}

export function ItemFormSheet({
  open,
  onOpenChange,
  courseId,
  moduleId,
  item,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courseId: string;
  moduleId: string;
  item: Activity | null;
}) {
  const isEdit = item != null;
  const save = useSaveActivity(courseId);

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: toDefaults(item),
  });

  // Re-seed the form whenever the sheet opens for a different target.
  React.useEffect(() => {
    if (open) reset(toDefaults(item));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item]);

  async function onValid(values: FormValues) {
    // Preserve any settings fields the editor doesn't surface (e.g. body).
    const settings: ActivitySettings = {
      ...settingsOf(item),
      title: values.title,
      type: values.type,
      published: values.published,
    };
    const payload: SaveActivityInput = {
      ...(isEdit ? { id: item!.id } : {}),
      settings,
      assetIds: item?.assetIds,
    };

    try {
      await save.mutateAsync({ moduleId, activity: payload });
      onOpenChange(false);
    } catch {
      // toast handled by the mutation hook
    }
  }

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? "Edit activity" : "New activity"}
      description={
        isEdit
          ? "Update this activity's details."
          : "Add content to this module. You can reorder it afterwards."
      }
      formId={FORM_ID}
      submitLabel={isEdit ? "Save changes" : "Add activity"}
      pending={save.isPending}
    >
      <form id={FORM_ID} onSubmit={handleSubmit(onValid)} className="flex flex-col gap-5">
        <Field id="title" label="Title" required error={errors.title?.message}>
          <Input id="title" placeholder="Welcome & overview" autoFocus {...register("title")} />
        </Field>

        <Field id="type" label="Activity type" error={errors.type?.message}>
          <Controller
            control={control}
            name="type"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACTIVITY_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {ACTIVITY_TYPE_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>

        <Field
          id="published"
          label="Visibility"
          hint="Published activities are visible to enrolled students."
        >
          <div className="flex items-center justify-between rounded-md border border-line bg-surface-2 px-3 py-2.5">
            <span className="text-sm text-ink-2">Published</span>
            <Controller
              control={control}
              name="published"
              render={({ field }) => (
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              )}
            />
          </div>
        </Field>
      </form>
    </FormSheet>
  );
}
