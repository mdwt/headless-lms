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
import { useCreateCourse, useUpdateCourse } from "@/lib/api/hooks";
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
  instructorName: z.string().trim().min(1, "Instructor is required"),
  description: z.string().trim().max(600, "Keep it under 600 characters").optional(),
});

type FormValues = z.infer<typeof schema>;

const FORM_ID = "course-form";

export function CourseFormSheet({
  open,
  onOpenChange,
  course,
  instructors,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present = edit mode; absent = create mode. */
  course?: Course;
  /** Distinct instructor names sourced from the current list. */
  instructors: string[];
}) {
  const isEdit = Boolean(course);
  const create = useCreateCourse();
  const update = useUpdateCourse();
  const pending = create.isPending || update.isPending;

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
      instructorName: "",
      description: "",
    },
  });

  // Re-seed the form whenever the sheet opens (for the active course or a blank create).
  React.useEffect(() => {
    if (!open) return;
    reset({
      title: course?.title ?? "",
      category: course?.category ?? "",
      instructorName: course?.instructorName ?? "",
      description: course?.description ?? "",
    });
  }, [open, course, reset]);

  const category = watch("category");
  const instructorName = watch("instructorName");

  // Allow an existing instructor name even if it's not in the derived list.
  const instructorOptions = React.useMemo(() => {
    const set = new Set(instructors.filter(Boolean));
    if (course?.instructorName) set.add(course.instructorName);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [instructors, course]);

  const onSubmit = handleSubmit((values) => {
    const patch: Partial<Course> = {
      title: values.title.trim(),
      category: values.category,
      instructorName: values.instructorName.trim(),
      description: values.description?.trim() ?? "",
    };
    if (isEdit && course) {
      update.mutate(
        { id: course.id, patch },
        { onSuccess: () => onOpenChange(false) },
      );
    } else {
      create.mutate(patch, { onSuccess: () => onOpenChange(false) });
    }
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
          id="instructorName"
          label="Instructor"
          required
          error={errors.instructorName?.message}
          hint={instructorOptions.length === 0 ? "No instructors available yet." : undefined}
        >
          <Select
            value={instructorName || undefined}
            onValueChange={(v) =>
              setValue("instructorName", v, { shouldValidate: true, shouldDirty: true })
            }
          >
            <SelectTrigger id="instructorName" aria-invalid={Boolean(errors.instructorName)}>
              <SelectValue placeholder="Assign an instructor" />
            </SelectTrigger>
            <SelectContent>
              {instructorOptions.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
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
