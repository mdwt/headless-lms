"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/forms/field";

import { updateOrganizationAction } from "./actions";

const schema = z.object({
  name: z.string().min(1, "Give your organization a name").max(100),
  slug: z
    .string()
    .min(1, "A slug is required")
    .max(50)
    .regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers, and hyphens only"),
});
type Values = z.infer<typeof schema>;

/** Organization → General: edit the active org's name and slug. */
export function GeneralView({ name, slug }: { name: string; slug: string }) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { name, slug } });

  async function onSubmit(values: Values) {
    try {
      const org = await updateOrganizationAction(values);
      toast.success("Organization updated");
      // Reset the form's baseline to the saved values (clears the dirty state).
      reset({ name: org.name, slug: org.slug });
      router.refresh();
    } catch (e) {
      toast.error("Couldn't update organization", {
        description: e instanceof Error ? e.message : undefined,
      });
    }
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex max-w-xl flex-col rounded-card border border-line bg-surface"
      noValidate
    >
      <div className="flex flex-col gap-5 p-6">
        <Field id="org-name" label="Name" error={errors.name?.message} required>
          <Input id="org-name" {...register("name")} />
        </Field>
        <Field
          id="org-slug"
          label="Slug"
          error={errors.slug?.message}
          hint="Used to identify your organization in URLs."
          required
        >
          <Input id="org-slug" {...register("slug")} />
        </Field>
      </div>
      <div className="flex justify-end border-t border-line px-6 py-4">
        <Button type="submit" variant="primary" disabled={isSubmitting || !isDirty}>
          {isSubmitting && <Loader2 className="animate-spin" />}
          Save changes
        </Button>
      </div>
    </form>
  );
}
