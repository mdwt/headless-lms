"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
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

// Details tab form: edits course metadata inline (title, category, description).
// Replaces the former edit-details sheet.
export function CourseDetailsForm({ course }: { course: Course }) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: course.title,
      category: course.category,
      description: course.description,
    },
  });

  // Re-sync when the server sends a fresh course (after a save revalidates).
  React.useEffect(() => {
    reset({ title: course.title, category: course.category, description: course.description });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [course.id, course.title, course.category, course.description]);

  const category = watch("category");

  function onValid(values: FormValues) {
    startTransition(async () => {
      try {
        await updateCourseDetailsAction(course.id, values);
        toast.success("Changes saved");
        router.refresh();
      } catch (err) {
        toast.error("Couldn't save changes", { description: (err as Error).message });
      }
    });
  }

  return (
    <form onSubmit={handleSubmit(onValid)} className="flex max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-5">
        <Field id="title" label="Title" required error={errors.title?.message}>
          <Input id="title" {...register("title")} />
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
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-line pt-5">
        <Button type="submit" variant="primary" disabled={isPending || !isDirty}>
          {isPending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
