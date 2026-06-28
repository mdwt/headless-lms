"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { FormSheet } from "@/components/forms/form-sheet";
import { Field } from "@/components/forms/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useUpdateCourse } from "@/lib/api/hooks";
import type { Course } from "@/lib/api/types";

const schema = z.object({
  title: z.string().trim().min(1, "A title is required").max(120, "Keep it under 120 characters"),
  category: z.string().trim().min(1, "Add a category").max(48),
  description: z.string().trim().max(600, "Keep the description under 600 characters"),
});

type FormValues = z.infer<typeof schema>;

const FORM_ID = "course-details-form";

export function CourseDetailsSheet({
  open,
  onOpenChange,
  course,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  course: Course;
}) {
  const update = useUpdateCourse();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: course.title,
      category: course.category,
      description: course.description,
    },
  });

  React.useEffect(() => {
    if (open) {
      reset({ title: course.title, category: course.category, description: course.description });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, course.id]);

  async function onValid(values: FormValues) {
    try {
      await update.mutateAsync({ id: course.id, patch: values });
      onOpenChange(false);
    } catch {
      /* toast handled by hook */
    }
  }

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Edit course details"
      description="Update how this course appears in the catalog."
      formId={FORM_ID}
      submitLabel="Save changes"
      pending={update.isPending}
    >
      <form id={FORM_ID} onSubmit={handleSubmit(onValid)} className="flex flex-col gap-5">
        <Field id="title" label="Title" required error={errors.title?.message}>
          <Input id="title" autoFocus {...register("title")} />
        </Field>
        <Field id="category" label="Category" required error={errors.category?.message}>
          <Input id="category" placeholder="e.g. Engineering" {...register("category")} />
        </Field>
        <Field
          id="description"
          label="Description"
          hint="A short summary shown on the course card."
          error={errors.description?.message}
        >
          <Textarea id="description" rows={5} {...register("description")} />
        </Field>
      </form>
    </FormSheet>
  );
}
