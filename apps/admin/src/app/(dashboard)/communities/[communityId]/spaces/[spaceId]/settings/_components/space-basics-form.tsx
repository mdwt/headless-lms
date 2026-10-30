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
import type { Space } from "@/lib/api/types";

import { updateSpaceAction } from "../../../../../actions";

const schema = z.object({
  name: z.string().trim().min(1, "A name is required").max(120, "Keep it under 120 characters"),
  description: z.string().trim().max(2000, "Keep it under 2,000 characters").optional(),
});

type FormValues = z.infer<typeof schema>;

export function SpaceBasicsForm({ communityId, space }: { communityId: string; space: Space }) {
  const [isPending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: space.name, description: space.description },
  });

  useEffect(() => {
    reset({ name: space.name, description: space.description });
  }, [space.id, space.name, space.description, reset]);

  function onValid(values: FormValues) {
    startTransition(async () => {
      try {
        await updateSpaceAction(communityId, space.id, {
          name: values.name,
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
        <Field id="space-name" label="Name" required error={errors.name?.message}>
          <Input id="space-name" aria-invalid={Boolean(errors.name)} {...register("name")} />
        </Field>
        <Field
          id="space-description"
          label="Description"
          hint="Tells members what the space is for."
          error={errors.description?.message}
        >
          <Textarea id="space-description" rows={3} {...register("description")} />
        </Field>
      </SettingsSection>
    </form>
  );
}
