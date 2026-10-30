"use client";

import { useEffect, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { Field } from "@/components/forms/field";
import { SettingsSection } from "@/components/forms/settings-section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Space } from "@/lib/api/types";

import { updateSpaceAction } from "../../../../../actions";
import { ACCESS_RULES } from "../../../../_components/space-access";
import { capacitySchema, parseCapacity } from "../../../../_components/capacity";

const schema = z.object({
  accessRule: z.enum(["all_members", "by_request", "by_invite"]),
  capacity: capacitySchema,
});

type FormValues = z.infer<typeof schema>;

function valuesOf(space: Space): FormValues {
  return {
    accessRule: space.accessRule,
    capacity: space.capacity === null ? "" : String(space.capacity),
  };
}

export function SpaceAccessForm({ communityId, space }: { communityId: string; space: Space }) {
  const [isPending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    control,
    formState: { errors, isDirty },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: valuesOf(space) });

  useEffect(() => {
    reset({
      accessRule: space.accessRule,
      capacity: space.capacity === null ? "" : String(space.capacity),
    });
  }, [space.id, space.accessRule, space.capacity, reset]);

  const accessRule = useWatch({ control, name: "accessRule" });
  const rule = ACCESS_RULES.find((r) => r.value === accessRule);

  function onValid(values: FormValues) {
    startTransition(async () => {
      try {
        await updateSpaceAction(communityId, space.id, {
          accessRule: values.accessRule,
          capacity: values.accessRule === "all_members" ? null : parseCapacity(values.capacity),
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
        title="Access"
        description="Who can open this space, on top of holding the community."
        footer={
          <Button type="submit" variant="primary" disabled={isPending || !isDirty}>
            {isPending ? "Saving…" : "Save"}
          </Button>
        }
      >
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field id="space-access-rule" label="Who can open it" hint={rule?.hint}>
            <Select
              value={accessRule}
              onValueChange={(v) =>
                setValue("accessRule", v as FormValues["accessRule"], { shouldDirty: true })
              }
            >
              <SelectTrigger id="space-access-rule">
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
              id="space-access-capacity"
              label="Capacity"
              hint="Most people the space holds. Leave blank for no limit."
              error={errors.capacity?.message}
            >
              <Input
                id="space-access-capacity"
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
      </SettingsSection>
    </form>
  );
}
