"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/forms/field";
import { SettingsSection } from "@/components/forms/settings-section";

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
export function GeneralView({
  name,
  slug,
  canEdit,
}: {
  name: string;
  slug: string;
  canEdit: boolean;
}) {
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
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <SettingsSection
        title="Organization"
        description="Your organization's name and URL slug."
        footer={
          canEdit ? (
            <Button type="submit" variant="primary" disabled={isSubmitting || !isDirty}>
              {isSubmitting && <Loader2 className="animate-spin" />}
              Save
            </Button>
          ) : undefined
        }
      >
        <Field id="org-name" label="Name" error={errors.name?.message} required>
          <Input id="org-name" disabled={!canEdit} {...register("name")} />
        </Field>
        <Field
          id="org-slug"
          label="Slug"
          error={errors.slug?.message}
          hint="Used to identify your organization in URLs."
          required
        >
          <Input id="org-slug" disabled={!canEdit} {...register("slug")} />
        </Field>
      </SettingsSection>
    </form>
  );
}
