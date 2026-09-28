"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AlertTriangle, Loader2 } from "lucide-react";

import { resetPassword } from "@/lib/auth/client";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthHeading } from "../_components/auth-heading";

const schema = z
  .object({
    password: z.string().min(8, "Use at least 8 characters"),
    confirm: z.string().min(1, "Confirm your new password"),
  })
  .refine((values) => values.password === values.confirm, {
    message: "Passwords don't match",
    path: ["confirm"],
  });
type Values = z.infer<typeof schema>;

type Stage = "form" | "invalid" | "done";

export function ResetPasswordForm({ token }: { token: string | null }) {
  const [stage, setStage] = useState<Stage>(token ? "form" : "invalid");
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { password: "", confirm: "" },
  });

  async function onSubmit(values: Values) {
    if (!token) return;
    setFormError(null);
    const { error } = await resetPassword({ newPassword: values.password, token });
    if (error?.code === "INVALID_TOKEN") {
      setStage("invalid");
      return;
    }
    if (error) {
      setFormError(error.message ?? "Couldn't reset your password");
      return;
    }
    setStage("done");
  }

  if (stage === "invalid") {
    return (
      <>
        <AuthHeading title="This link has expired">
          Reset links work once and only for a limited time. Request a new one to choose a password.
        </AuthHeading>
        <Button asChild variant="primary" className="mt-6 w-full">
          <Link href="/forgot-password">Request a new link</Link>
        </Button>
        <p className="mt-6 text-center text-sm text-ink-3">
          <Link href="/login" className="font-medium text-brand underline-offset-4 hover:underline">
            Back to sign in
          </Link>
        </p>
      </>
    );
  }

  if (stage === "done") {
    return (
      <>
        <AuthHeading title="Password updated">
          Your password has been changed. Sign in with your new password.
        </AuthHeading>
        <Button asChild variant="primary" className="mt-6 w-full">
          <Link href="/login">Sign in</Link>
        </Button>
      </>
    );
  }

  return (
    <>
      <AuthHeading title="Choose a new password">
        Your new password replaces the old one and signs you out on every device.
      </AuthHeading>
      {formError && (
        <div className="mt-5 flex items-start gap-2.5 rounded-lg border border-danger/20 bg-danger-soft px-3 py-2.5 text-sm text-danger">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>{formError}</p>
        </div>
      )}
      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 flex flex-col gap-4" noValidate>
        <Field id="password" label="New password" error={errors.password?.message}>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            placeholder="At least 8 characters"
            aria-invalid={!!errors.password}
            {...register("password")}
          />
        </Field>
        <Field id="confirm" label="Confirm new password" error={errors.confirm?.message}>
          <Input
            id="confirm"
            type="password"
            autoComplete="new-password"
            aria-invalid={!!errors.confirm}
            {...register("confirm")}
          />
        </Field>
        <Button type="submit" variant="primary" disabled={isSubmitting} className="mt-1 w-full">
          {isSubmitting && <Loader2 className="animate-spin" />}
          Update password
        </Button>
      </form>
    </>
  );
}
