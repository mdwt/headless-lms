"use client";

import { useEffect, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { FormDialog } from "@/components/forms/form-dialog";
import { Field } from "@/components/forms/field";
import { Input } from "@/components/ui/input";
import type { ActivitySettings } from "@/lib/api/types";

import { saveActivityAction } from "../actions";

const schema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Give this activity a title")
    .max(120, "Keep the title under 120 characters"),
});

type FormValues = z.infer<typeof schema>;

const FORM_ID = "new-activity-form";

/**
 * Create-only. A title is all it takes to get an activity into the module —
 * everything else (publishing, completion rule, transcripts) is edited on the
 * activity's settings tab, so this stays a one-field modal.
 */
export function NewActivityDialog({
  open,
  onOpenChange,
  courseId,
  moduleId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courseId: string;
  moduleId: string;
}) {
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { title: "" },
  });

  // Clear the previous draft whenever the modal reopens.
  useEffect(() => {
    if (open) reset({ title: "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function onValid(values: FormValues) {
    const settings: ActivitySettings = { title: values.title, published: false };

    startTransition(async () => {
      try {
        await saveActivityAction(courseId, moduleId, { settings });
      } catch (err) {
        toast.error("Something went wrong", { description: (err as Error).message });
        return;
      }
      toast.success("Activity added");
      onOpenChange(false);
    });
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="New activity"
      description="Add content to this module. You can reorder it afterwards."
      formId={FORM_ID}
      submitLabel="Add activity"
      pending={isPending}
    >
      <form id={FORM_ID} onSubmit={handleSubmit(onValid)} noValidate>
        <Field id="title" label="Title" required error={errors.title?.message}>
          <Input id="title" placeholder="Welcome & overview" autoFocus {...register("title")} />
        </Field>
      </form>
    </FormDialog>
  );
}
