"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { FormSheet } from "@/components/forms/form-sheet";
import { Field } from "@/components/forms/field";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ApiError } from "@/lib/api/http";

import { createStudentAction } from "../actions";

const FORM_ID = "add-student-form";

const schema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.email("Enter a valid email"),
  sendInvite: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

const DEFAULTS: FormValues = { firstName: "", lastName: "", email: "", sendInvite: true };

export function AddStudentSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: DEFAULTS });

  // Reset to a clean slate every time the sheet opens.
  React.useEffect(() => {
    if (open) reset(DEFAULTS);
  }, [open, reset]);

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      try {
        const student = await createStudentAction(values);
        toast.success(values.sendInvite ? "Student added — invitation sent" : "Student added");
        onOpenChange(false);
        router.push(`/students/${student.id}`);
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
          setError("email", { message: "A student with this email already exists" });
          return;
        }
        toast.error("Couldn't add student", { description: (err as Error).message });
      }
    });
  });

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Add student"
      description="Create a student record. Send an invitation so they can set up their portal account."
      formId={FORM_ID}
      submitLabel="Add student"
      pending={pending}
    >
      <form id={FORM_ID} onSubmit={onSubmit} className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-4">
          <Field id="firstName" label="First name" required error={errors.firstName?.message}>
            <Input id="firstName" aria-invalid={!!errors.firstName} {...register("firstName")} />
          </Field>
          <Field id="lastName" label="Last name" required error={errors.lastName?.message}>
            <Input id="lastName" aria-invalid={!!errors.lastName} {...register("lastName")} />
          </Field>
        </div>
        <Field id="email" label="Email" required error={errors.email?.message}>
          <Input id="email" type="email" aria-invalid={!!errors.email} {...register("email")} />
        </Field>
        <Field
          id="sendInvite"
          label="Invitation"
          hint="Email a single-use link to the student portal where they create their account."
        >
          <label className="flex items-center gap-2 text-sm text-ink">
            <Checkbox id="sendInvite" {...register("sendInvite")} />
            Send invite email
          </label>
        </Field>
      </form>
    </FormSheet>
  );
}
