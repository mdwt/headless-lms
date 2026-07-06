"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

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
import type { Course } from "@/lib/api/types";

import { updateCourseDetailsAction } from "../actions";

// Kept in sync with the create/edit list sheet (`course-form-sheet`).
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
  title: z.string().trim().min(1, "A title is required").max(120, "Keep it under 120 characters"),
  category: z.string().min(1, "Pick a category"),
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
  const [isPending, startTransition] = React.useTransition();
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

  const category = watch("category");

  function onValid(values: FormValues) {
    startTransition(async () => {
      try {
        await updateCourseDetailsAction(course.id, values);
        toast.success("Changes saved");
        onOpenChange(false);
      } catch (err) {
        toast.error("Couldn't save changes", { description: (err as Error).message });
      }
    });
  }

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Edit course details"
      description="Update how this course appears in the catalog."
      formId={FORM_ID}
      submitLabel="Save changes"
      pending={isPending}
    >
      <form id={FORM_ID} onSubmit={handleSubmit(onValid)} className="flex flex-col gap-5">
        <Field id="title" label="Title" required error={errors.title?.message}>
          <Input id="title" autoFocus {...register("title")} />
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
          hint="A short summary shown on the course card."
          error={errors.description?.message}
        >
          <Textarea id="description" rows={5} {...register("description")} />
        </Field>
      </form>
    </FormSheet>
  );
}
