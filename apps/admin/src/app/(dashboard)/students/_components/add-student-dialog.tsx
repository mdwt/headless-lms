"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { FormDialog } from "@/components/forms/form-dialog";
import { Field } from "@/components/forms/field";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

import { addStudentAction } from "../actions";
import { UNREACHABLE } from "@/lib/api/refusal";

const FORM_ID = "add-student-form";

// The name columns are nullable for people who arrive by self-signup, not so an
// admin can skip them — someone adding a student knows who they are.
const schema = z.object({
  firstName: z.string().trim().min(1, "Enter a first name"),
  lastName: z.string().trim().min(1, "Enter a last name"),
  email: z.email("Enter a valid email"),
  sendEmail: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

const DEFAULTS: FormValues = { firstName: "", lastName: "", email: "", sendEmail: true };

export function AddStudentDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: DEFAULTS });

  // Reset to a clean slate every time the dialog opens.
  useEffect(() => {
    if (open) reset(DEFAULTS);
  }, [open, reset]);

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      try {
        const refusal = await addStudentAction(values);
        if (refusal) {
          toast.error("Couldn't add the student", { description: refusal.refused });
          return;
        }
        toast.success(values.sendEmail ? "Invite sent" : "Student added", {
          description: values.email,
        });
        onOpenChange(false);
        router.refresh();
      } catch {
        toast.error("Couldn't add the student", { description: UNREACHABLE });
      }
    });
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add student"
      description="The student is added to your organization straight away. The invite emails them a single-use link to create their account."
      formId={FORM_ID}
      submitLabel="Add student"
      pending={pending}
    >
      <form id={FORM_ID} onSubmit={onSubmit} className="flex flex-col gap-5">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field id="firstName" label="First name" required error={errors.firstName?.message}>
            <Input
              id="firstName"
              autoComplete="given-name"
              aria-invalid={!!errors.firstName}
              {...register("firstName")}
            />
          </Field>
          <Field id="lastName" label="Last name" required error={errors.lastName?.message}>
            <Input
              id="lastName"
              autoComplete="family-name"
              aria-invalid={!!errors.lastName}
              {...register("lastName")}
            />
          </Field>
        </div>

        <Field id="email" label="Email" required error={errors.email?.message}>
          <Input id="email" type="email" aria-invalid={!!errors.email} {...register("email")} />
        </Field>

        <label htmlFor="sendEmail" className="flex items-center gap-2.5 text-sm text-ink-2">
          <Checkbox id="sendEmail" {...register("sendEmail")} />
          Send invite email
        </label>
      </form>
    </FormDialog>
  );
}
