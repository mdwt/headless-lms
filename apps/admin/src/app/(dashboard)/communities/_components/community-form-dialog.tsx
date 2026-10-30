"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { FormDialog } from "@/components/forms/form-dialog";
import { Field } from "@/components/forms/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { createCommunityAction } from "../actions";

const schema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200, "Keep it under 200 characters"),
  description: z.string().trim().max(5000, "Keep it under 5,000 characters").optional(),
});

type FormValues = z.infer<typeof schema>;

const FORM_ID = "community-form";

export function CommunityFormDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { title: "", description: "" },
  });

  useEffect(() => {
    if (open) reset({ title: "", description: "" });
  }, [open, reset]);

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      try {
        const community = await createCommunityAction({
          title: values.title,
          description: values.description ?? "",
        });
        toast.success("Community created");
        onOpenChange(false);
        router.push(`/communities/${community.id}/spaces`);
      } catch (e) {
        toast.error("Couldn't create community", { description: (e as Error).message });
      }
    });
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="New community"
      description="Create a draft community. You can add its spaces next."
      formId={FORM_ID}
      submitLabel="Create community"
      pending={pending}
    >
      <form id={FORM_ID} onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        <Field id="title" label="Title" required error={errors.title?.message}>
          <Input
            id="title"
            placeholder="e.g. Founder Collab Community"
            autoFocus
            aria-invalid={Boolean(errors.title)}
            {...register("title")}
          />
        </Field>
        <Field
          id="description"
          label="Description"
          error={errors.description?.message}
          hint="Shown to members at the top of the community."
        >
          <Textarea
            id="description"
            rows={4}
            aria-invalid={Boolean(errors.description)}
            {...register("description")}
          />
        </Field>
      </form>
    </FormDialog>
  );
}
