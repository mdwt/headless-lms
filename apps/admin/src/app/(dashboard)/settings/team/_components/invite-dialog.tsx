"use client";

import { useEffect, useTransition } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { FormDialog } from "@/components/forms/form-dialog";
import { Field } from "@/components/forms/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { OrgRole } from "@/lib/api/types";
import { inviteMemberAction } from "../actions";

const FORM_ID = "invite-member-form";

const schema = z.object({
  email: z.string().min(1, "Email is required").email("Enter a valid email address"),
  roleKey: z.string().min(1, "Select a role"),
});

type InviteValues = z.infer<typeof schema>;

export function InviteDialog({
  open,
  onOpenChange,
  roles,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roles: OrgRole[];
}) {
  const initialRole = (roles.find((r) => r.permissions.length > 0) ?? roles[0])?.key ?? "";
  const [pending, startTransition] = useTransition();
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<InviteValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", roleKey: initialRole },
  });

  // Reset the form each time the sheet is (re)opened.
  useEffect(() => {
    if (open) reset({ email: "", roleKey: initialRole });
  }, [open, reset, initialRole]);

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      try {
        await inviteMemberAction(values);
        toast.success("Invitation sent", { description: values.email });
        onOpenChange(false);
      } catch (e) {
        toast.error("Couldn't send invite", { description: (e as Error).message });
      }
    });
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Invite member"
      description="Send an invitation to join this organization. They'll receive an email to accept."
      formId={FORM_ID}
      submitLabel="Send invitation"
      pending={pending}
    >
      <form id={FORM_ID} onSubmit={onSubmit} className="flex flex-col gap-5">
        <Field
          id="invite-email"
          label="Email address"
          required
          error={errors.email?.message}
          hint="We'll send a one-time invitation link to this address."
        >
          <Input
            id="invite-email"
            type="email"
            autoComplete="off"
            placeholder="name@company.com"
            aria-invalid={!!errors.email}
            {...register("email")}
          />
        </Field>

        <Controller
          control={control}
          name="roleKey"
          render={({ field }) => (
            <Field
              id="invite-role"
              label="Org role"
              required
              error={errors.roleKey?.message}
              hint={
                roles.find((r) => r.key === field.value)?.description ||
                "The role they hold across the whole org once they accept."
              }
            >
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="invite-role" aria-invalid={!!errors.roleKey}>
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
