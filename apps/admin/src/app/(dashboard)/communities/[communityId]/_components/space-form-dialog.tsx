"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { FormDialog } from "@/components/forms/form-dialog";
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

import { createSpaceAction } from "../../actions";
import { ACCESS_RULES } from "./space-access";
import { capacitySchema, parseCapacity } from "./capacity";

const schema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120, "Keep it under 120 characters"),
  description: z.string().trim().max(2000, "Keep it under 2,000 characters").optional(),
  accessRule: z.enum(["all_members", "by_request", "by_invite"]),
  capacity: capacitySchema,
});

type FormValues = z.infer<typeof schema>;

const FORM_ID = "space-form";
const EMPTY: FormValues = { name: "", description: "", accessRule: "all_members", capacity: "" };

export function SpaceFormDialog({
  communityId,
  open,
  onOpenChange,
}: {
  communityId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    control,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY });

  useEffect(() => {
    if (open) reset(EMPTY);
  }, [open, reset]);

  const accessRule = useWatch({ control, name: "accessRule" });
  const rule = ACCESS_RULES.find((r) => r.value === accessRule);

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      try {
        const space = await createSpaceAction(communityId, {
          name: values.name,
          description: values.description ?? "",
          accessRule: values.accessRule,
          capacity: values.accessRule === "all_members" ? null : parseCapacity(values.capacity),
        });
        toast.success("Space created");
        onOpenChange(false);
        router.push(`/communities/${communityId}/spaces/${space.id}`);
      } catch (e) {
        toast.error("Couldn't create space", { description: (e as Error).message });
      }
    });
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="New space"
      description="The space is added at the end of the community. You can set its topics, links and post rules next."
      formId={FORM_ID}
      submitLabel="Create space"
      pending={pending}
    >
      <form id={FORM_ID} onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        <Field id="space-name" label="Name" required error={errors.name?.message}>
          <Input
            id="space-name"
            placeholder="e.g. Introductions"
            autoFocus
            aria-invalid={Boolean(errors.name)}
            {...register("name")}
          />
        </Field>
        <Field id="space-description" label="Description" error={errors.description?.message}>
          <Textarea id="space-description" rows={3} {...register("description")} />
        </Field>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field id="space-access" label="Who can open it" hint={rule?.hint}>
            <Select
              value={accessRule}
              onValueChange={(v) =>
                setValue("accessRule", v as FormValues["accessRule"], { shouldDirty: true })
              }
            >
              <SelectTrigger id="space-access">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACCESS_RULES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {accessRule !== "all_members" && (
            <Field
              id="space-capacity"
              label="Capacity"
              hint="Leave blank for no limit."
              error={errors.capacity?.message}
            >
              <Input
                id="space-capacity"
                type="number"
                inputMode="numeric"
                min={1}
                placeholder="No limit"
                aria-invalid={Boolean(errors.capacity)}
                {...register("capacity")}
              />
            </Field>
          )}
        </div>
      </form>
    </FormDialog>
  );
}
