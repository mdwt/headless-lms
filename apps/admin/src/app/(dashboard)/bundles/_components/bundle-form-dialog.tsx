"use client";

import { useEffect, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { FormDialog } from "@/components/forms/form-dialog";
import { Field } from "@/components/forms/field";
import { Input } from "@/components/ui/input";
import type { BundleRow } from "@/lib/api/types";

import { createBundleAction, updateBundleAction } from "../actions";
import { ContentMultiSelect, type LiteContent } from "./content-multi-select";

const schema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120, "Keep it under 120 characters"),
  contentIds: z.array(z.string()),
});

type FormValues = z.infer<typeof schema>;

const FORM_ID = "bundle-form";

export function BundleFormDialog({
  open,
  onOpenChange,
  bundle,
  content,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present = edit mode; absent = create mode. */
  bundle?: BundleRow;
  content: LiteContent[];
}) {
  const isEdit = Boolean(bundle);
  const [pending, startTransition] = useTransition();

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", contentIds: [] },
  });

  // Re-seed the form whenever the sheet opens (for the active bundle or a
  // blank create). Key on the stable `bundle?.id`, NOT the whole object — a
  // list revalidation while the sheet is open streams a new reference with
  // identical data, and depending on it would wipe in-progress edits.
  useEffect(() => {
    if (!open) return;
    reset({ name: bundle?.name ?? "", contentIds: bundle?.contentIds ?? [] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, bundle?.id]);

  const onSubmit = handleSubmit((values) => {
    const name = values.name.trim();
    startTransition(async () => {
      try {
        if (isEdit && bundle) {
          const before = new Set(bundle.contentIds);
          const after = new Set(values.contentIds);
          await updateBundleAction(bundle.id, {
            name: name !== bundle.name ? name : undefined,
            addContentIds: values.contentIds.filter((id) => !before.has(id)),
            removeContentIds: bundle.contentIds.filter((id) => !after.has(id)),
          });
        } else {
          await createBundleAction({ name, contentIds: values.contentIds });
        }
        toast.success(isEdit ? "Changes saved" : "Bundle created");
        onOpenChange(false);
      } catch (e) {
        toast.error(isEdit ? "Couldn't save" : "Couldn't create bundle", {
          description: (e as Error).message,
        });
      }
    });
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? "Edit bundle" : "New bundle"}
      formId={FORM_ID}
      submitLabel={isEdit ? "Save" : "Create bundle"}
      pending={pending}
    >
      <form id={FORM_ID} onSubmit={onSubmit} className="flex flex-col gap-5">
        <Field id="name" label="Name" required error={errors.name?.message}>
          <Input
            id="name"
            placeholder="e.g. Starter Pack"
            aria-invalid={Boolean(errors.name)}
            {...register("name")}
          />
        </Field>

        <Controller
          control={control}
          name="contentIds"
          render={({ field }) => (
            <Field
              id="contentIds"
              label="Content"
              hint="Courses, downloads and communities included in this bundle."
              error={errors.contentIds?.message}
            >
              <ContentMultiSelect
                id="contentIds"
                value={field.value}
                onValueChange={field.onChange}
                content={content}
              />
            </Field>
          )}
        />
      </form>
    </FormDialog>
  );
}
