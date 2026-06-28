"use client";

import * as React from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { FormSheet } from "@/components/forms/form-sheet";
import { Field } from "@/components/forms/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSaveItem } from "@/lib/api/hooks";
import type { LessonType, ModuleItem } from "@/lib/api/types";

const LESSON_TYPES: LessonType[] = ["video", "text", "pdf", "audio", "download", "embed"];
const LESSON_TYPE_LABEL: Record<LessonType, string> = {
  video: "Video",
  text: "Text / article",
  pdf: "PDF",
  audio: "Audio",
  download: "Download",
  embed: "Embed",
};

const schema = z
  .object({
    kind: z.enum(["lesson", "assessment"]),
    title: z
      .string()
      .trim()
      .min(1, "Give this item a title")
      .max(120, "Keep the title under 120 characters"),
    lessonType: z.enum(["video", "text", "pdf", "audio", "download", "embed"]),
    durationLabel: z.string().trim().max(40, "Keep it short, e.g. “12 min”").optional(),
    assessmentType: z.enum(["quiz", "assignment"]),
    questionCount: z.string().optional(),
    pointsPossible: z.string().optional(),
    published: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (v.kind !== "assessment") return;
    if (v.assessmentType === "quiz") {
      const n = Number(v.questionCount);
      if (!v.questionCount || Number.isNaN(n) || n < 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["questionCount"],
          message: "Enter at least one question",
        });
      }
    } else {
      const n = Number(v.pointsPossible);
      if (!v.pointsPossible || Number.isNaN(n) || n < 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["pointsPossible"],
          message: "Enter the total points",
        });
      }
    }
  });

type FormValues = z.infer<typeof schema>;

const FORM_ID = "item-form";

function toDefaults(item: ModuleItem | null, fallbackKind: "lesson" | "assessment"): FormValues {
  if (!item) {
    return {
      kind: fallbackKind,
      title: "",
      lessonType: "video",
      durationLabel: "",
      assessmentType: "quiz",
      questionCount: "10",
      pointsPossible: "100",
      published: false,
    };
  }
  if (item.kind === "lesson") {
    return {
      kind: "lesson",
      title: item.title,
      lessonType: item.type,
      durationLabel: item.durationLabel ?? "",
      assessmentType: "quiz",
      questionCount: "10",
      pointsPossible: "100",
      published: item.published,
    };
  }
  return {
    kind: "assessment",
    title: item.title,
    lessonType: "video",
    durationLabel: "",
    assessmentType: item.type,
    questionCount: item.questionCount != null ? String(item.questionCount) : "10",
    pointsPossible: item.pointsPossible != null ? String(item.pointsPossible) : "100",
    published: item.published,
  };
}

export function ItemFormSheet({
  open,
  onOpenChange,
  courseId,
  moduleId,
  item,
  defaultKind = "lesson",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courseId: string;
  moduleId: string;
  item: ModuleItem | null;
  defaultKind?: "lesson" | "assessment";
}) {
  const isEdit = item != null;
  const save = useSaveItem(courseId);

  const {
    control,
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: toDefaults(item, defaultKind),
  });

  // Re-seed the form whenever the sheet opens for a different target.
  React.useEffect(() => {
    if (open) reset(toDefaults(item, defaultKind));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item, defaultKind]);

  const kind = useWatch({ control, name: "kind" });
  const assessmentType = useWatch({ control, name: "assessmentType" });

  async function onValid(values: FormValues) {
    const payload: Partial<ModuleItem> & { id?: string } =
      values.kind === "lesson"
        ? {
            ...(isEdit ? { id: item!.id } : {}),
            kind: "lesson",
            title: values.title,
            type: values.lessonType,
            durationLabel: values.durationLabel?.trim() ? values.durationLabel.trim() : undefined,
            published: values.published,
          }
        : {
            ...(isEdit ? { id: item!.id } : {}),
            kind: "assessment",
            title: values.title,
            type: values.assessmentType,
            published: values.published,
            ...(values.assessmentType === "quiz"
              ? { questionCount: Number(values.questionCount) }
              : { pointsPossible: Number(values.pointsPossible) }),
          };

    try {
      await save.mutateAsync({ moduleId, item: payload });
      onOpenChange(false);
    } catch {
      // toast handled by the mutation hook
    }
  }

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? "Edit item" : kind === "assessment" ? "New assessment" : "New lesson"}
      description={
        isEdit
          ? "Update this item's details."
          : "Add content to this module. You can reorder it afterwards."
      }
      formId={FORM_ID}
      submitLabel={isEdit ? "Save changes" : "Add item"}
      pending={save.isPending}
    >
      <form id={FORM_ID} onSubmit={handleSubmit(onValid)} className="flex flex-col gap-5">
        <Tabs
          value={kind}
          onValueChange={(v) => setValue("kind", v as "lesson" | "assessment")}
        >
          <TabsList className="w-full">
            <TabsTrigger value="lesson" disabled={isEdit} className="flex-1">
              Lesson
            </TabsTrigger>
            <TabsTrigger value="assessment" disabled={isEdit} className="flex-1">
              Assessment
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <Field id="title" label="Title" required error={errors.title?.message}>
          <Input
            id="title"
            placeholder={kind === "assessment" ? "End-of-module quiz" : "Welcome & overview"}
            autoFocus
            {...register("title")}
          />
        </Field>

        {kind === "lesson" ? (
          <>
            <Field id="lessonType" label="Lesson type" error={errors.lessonType?.message}>
              <Controller
                control={control}
                name="lessonType"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="lessonType">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LESSON_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {LESSON_TYPE_LABEL[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
            <Field
              id="durationLabel"
              label="Duration"
              hint="Optional. Shown as a small label, e.g. “12 min”."
              error={errors.durationLabel?.message}
            >
              <Input id="durationLabel" placeholder="12 min" {...register("durationLabel")} />
            </Field>
          </>
        ) : (
          <>
            <Field id="assessmentType" label="Assessment type" error={errors.assessmentType?.message}>
              <Controller
                control={control}
                name="assessmentType"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="assessmentType">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="quiz">Quiz</SelectItem>
                      <SelectItem value="assignment">Assignment</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
            {assessmentType === "quiz" ? (
              <Field
                id="questionCount"
                label="Questions"
                required
                error={errors.questionCount?.message}
              >
                <Input
                  id="questionCount"
                  type="number"
                  min={1}
                  inputMode="numeric"
                  {...register("questionCount")}
                />
              </Field>
            ) : (
              <Field
                id="pointsPossible"
                label="Points possible"
                required
                error={errors.pointsPossible?.message}
              >
                <Input
                  id="pointsPossible"
                  type="number"
                  min={1}
                  inputMode="numeric"
                  {...register("pointsPossible")}
                />
              </Field>
            )}
          </>
        )}

        <Field id="published" label="Visibility" hint="Published items are visible to enrolled students.">
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
