"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { FormSheet } from "@/components/forms/form-sheet";
import { Field } from "@/components/forms/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

import { createCourseAction, updateCourseAction } from "../actions";
import type { Course } from "@/lib/api/types";

const CATEGORIES = [
  "Design",
  "Engineering",
  "Product",
  "Marketing",
  "Data",
  "Leadership",
  "Finance",
  "Operations",
] as const;

const schema = z.object({
  title: z.string().trim().min(1, "Title is required").max(120, "Keep it under 120 characters"),
  category: z.string().min(1, "Pick a category"),
  description: z.string().trim().max(600, "Keep it under 600 characters").optional(),
});

type FormValues = z.infer<typeof schema>;

const FORM_ID = "course-form";

export function CourseFormSheet({
  open,
  onOpenChange,
  course,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present = edit mode; absent = create mode. */
  course?: Course;
}) {
  const isEdit = Boolean(course);
  const [pending, startTransition] = React.useTransition();

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: "",
      category: "",
      description: "",
    },
  });

  // Re-seed the form whenever the sheet opens (for the active course or a blank create).
  React.useEffect(() => {
    if (!open) return;
    reset({
      title: course?.title ?? "",
      category: course?.category ?? "",
      description: course?.description ?? "",
    });
  }, [open, course, reset]);

  const category = watch("category");

  const onSubmit = handleSubmit((values) => {
    const input = {
      title: values.title.trim(),
      category: values.category,
      description: values.description?.trim() ?? "",
    };
    startTransition(async () => {
      try {
        if (isEdit && course) await updateCourseAction(course.id, input);
        else await createCourseAction(input);
        toast.success(isEdit ? "Changes saved" : "Course created");
        onOpenChange(false);
      } catch (e) {
        toast.error(isEdit ? "Couldn't save changes" : "Couldn't create course", {
          description: (e as Error).message,
        });
      }
    });
  });

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? "Edit course" : "New course"}
      description={
        isEdit
          ? "Update the course details. Content is managed in the builder."
          : "Create a draft course. You can add modules and lessons next."
      }
      formId={FORM_ID}
      submitLabel={isEdit ? "Save changes" : "Create course"}
      pending={pending}
    >
      <form id={FORM_ID} onSubmit={onSubmit} className="flex flex-col gap-5">
        <Field id="title" label="Title" required error={errors.title?.message}>
          <Input
            id="title"
            placeholder="e.g. Foundations of Product Design"
            aria-invalid={Boolean(errors.title)}
            {...register("title")}
          />
        </Field>

        <Field id="category" label="Category" required error={errors.category?.message}>
          <Select
            value={category || undefined}
            onValueChange={(v) =>
              setValue("category", v, { shouldValidate: true, shouldDirty: true })
            }
          >
            <SelectTrigger id="category" aria-invalid={Boolean(errors.category)}>
              <SelectValue placeholder="Select a category" />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field
          id="description"
          label="Description"
          error={errors.description?.message}
          hint="A short summary shown on the course card."
        >
          <Textarea
            id="description"
            rows={4}
            placeholder="What will students learn?"
            aria-invalid={Boolean(errors.description)}
            {...register("description")}
          />
        </Field>
      </form>
    </FormSheet>
  );
}
