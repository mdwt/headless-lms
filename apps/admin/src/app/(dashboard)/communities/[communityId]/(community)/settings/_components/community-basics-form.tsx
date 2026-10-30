"use client";

import { useEffect, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { Field } from "@/components/forms/field";
import { SettingsSection } from "@/components/forms/settings-section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Community } from "@/lib/api/types";

import { updateCommunityAction } from "../../../../actions";

const schema = z.object({
  title: z.string().trim().min(1, "A title is required").max(200, "Keep it under 200 characters"),
  description: z.string().trim().max(5000, "Keep it under 5,000 characters").optional(),
});

type FormValues = z.infer<typeof schema>;

export function CommunityBasicsForm({ community }: { community: Community }) {
  const [isPending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { title: community.title, description: community.description },
  });

  useEffect(() => {
    reset({ title: community.title, description: community.description });
  }, [community.id, community.title, community.description, reset]);

  function onValid(values: FormValues) {
    startTransition(async () => {
      try {
        await updateCommunityAction(community.id, {
          title: values.title,
          description: values.description ?? "",
        });
        toast.success("Changes saved");
      } catch (err) {
        toast.error("Couldn't save", { description: (err as Error).message });
      }
    });
  }

  return (
    <form onSubmit={handleSubmit(onValid)}>
      <SettingsSection
        title="Basics"
        footer={
          <Button type="submit" variant="primary" disabled={isPending || !isDirty}>
            {isPending ? "Saving…" : "Save"}
          </Button>
        }
      >
        <Field id="title" label="Title" required error={errors.title?.message}>
          <Input id="title" aria-invalid={Boolean(errors.title)} {...register("title")} />
        </Field>
        <Field
          id="description"
          label="Description"
          hint="Shown to members at the top of the community."
          error={errors.description?.message}
        >
          <Textarea id="description" rows={5} {...register("description")} />
        </Field>
      </SettingsSection>
    </form>
  );
}
