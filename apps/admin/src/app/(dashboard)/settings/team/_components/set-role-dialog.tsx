"use client";

import { useEffect, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { FormDialog } from "@/components/forms/form-dialog";
import { Field } from "@/components/forms/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { OrgRole } from "@/lib/api/types";
import { setOrgRoleAction } from "../actions";

const FORM_ID = "set-org-role-form";

const schema = z.object({
  roleKey: z.string().min(1, "Select a role"),
});

type FormValues = z.infer<typeof schema>;

export function SetRoleDialog({
  person,
  roles,
  onOpenChange,
}: {
  person: { id: string; name: string; roleKey: string } | null;
  roles: OrgRole[];
  onOpenChange: (open: boolean) => void;
}) {
  const [pending, startTransition] = useTransition();
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { roleKey: person?.roleKey ?? "" },
  });

  useEffect(() => {
    if (person) reset({ roleKey: person.roleKey });
  }, [person, reset]);

  const onSubmit = handleSubmit((values) => {
    if (!person) return;
    const next = roles.find((r) => r.key === values.roleKey);
    startTransition(async () => {
      try {
        await setOrgRoleAction(person.id, values.roleKey);
        toast.success("Org role updated", {
          description: `${person.name} is now ${next?.name ?? "updated"}`,
        });
        onOpenChange(false);
      } catch (e) {
        toast.error("Couldn't change org role", { description: (e as Error).message });
      }
    });
  });

  return (
    <FormDialog
      open={person !== null}
      onOpenChange={onOpenChange}
      title="Set org role"
      description={
        person
          ? `The role ${person.name} holds across the whole org. Roles on single items stay as they are.`
          : undefined
      }
      formId={FORM_ID}
      submitLabel="Set role"
      pending={pending}
      submitDisabled={!isDirty}
    >
      <form id={FORM_ID} onSubmit={onSubmit} className="flex flex-col gap-5">
        <Controller
          control={control}
          name="roleKey"
          render={({ field }) => (
            <Field
              id="set-org-role"
              label="Org role"
              required
              error={errors.roleKey?.message}
              hint={roles.find((r) => r.key === field.value)?.description || undefined}
            >
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="set-org-role" aria-invalid={!!errors.roleKey}>
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((r) => (
                    <SelectItem key={r.key} value={r.key}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
        />
      </form>
    </FormDialog>
  );
}
