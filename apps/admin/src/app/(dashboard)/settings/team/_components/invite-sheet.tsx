"use client";

import * as React from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { FormSheet } from "@/components/forms/form-sheet";
import { Field } from "@/components/forms/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { inviteMemberAction } from "../actions";

const FORM_ID = "invite-member-form";

/** Roles that can be invited — never owner (fixed) or student (not back-office). */
const INVITE_ROLES = [
  { value: "admin", label: "Admin" },
  { value: "instructor", label: "Instructor" },
] as const;

const schema = z.object({
  email: z.string().min(1, "Email is required").email("Enter a valid email address"),
  role: z.enum(["admin", "instructor"]),
});

type InviteValues = z.infer<typeof schema>;

export function InviteSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [pending, startTransition] = React.useTransition();
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<InviteValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", role: "instructor" },
  });

  // Reset the form each time the sheet is (re)opened.
  React.useEffect(() => {
    if (open) reset({ email: "", role: "instructor" });
  }, [open, reset]);

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
    <FormSheet
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

        <Field
          id="invite-role"
          label="Role"
          required
          error={errors.role?.message}
          hint="Admins manage the whole org. Instructors manage only their assigned courses."
        >
          <Controller
            control={control}
            name="role"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="invite-role" aria-invalid={!!errors.role}>
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  {INVITE_ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>
      </form>
    </FormSheet>
  );
}
