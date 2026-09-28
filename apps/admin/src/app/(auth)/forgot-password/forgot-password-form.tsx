"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AlertTriangle, Loader2 } from "lucide-react";

import { requestPasswordReset } from "@/lib/auth/client";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthHeading } from "../_components/auth-heading";

const schema = z.object({
  email: z.string().min(1, "Email is required").email("Enter a valid email"),
});
type Values = z.infer<typeof schema>;

export function ForgotPasswordForm() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: "" },
  });

  async function onSubmit(values: Values) {
    setFormError(null);
    const { error } = await requestPasswordReset({
      email: values.email,
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) {
      setFormError(error.message ?? "Couldn't send the reset link");
      return;
    }
    setSentTo(values.email);
  }

  return (
    <>
      {sentTo ? (
        <AuthHeading title="Check your email">
          If an account exists for {sentTo}, you&apos;ll get a link to reset its password shortly.
        </AuthHeading>
      ) : (
        <>
          <AuthHeading title="Reset your password">
            Enter the email you sign in with and we&apos;ll send you a link to choose a new
            password.
          </AuthHeading>
          {formError && (
            <div className="mt-5 flex items-start gap-2.5 rounded-lg border border-danger/20 bg-danger-soft px-3 py-2.5 text-sm text-danger">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <p>{formError}</p>
            </div>
          )}
          <form onSubmit={handleSubmit(onSubmit)} className="mt-6 flex flex-col gap-4" noValidate>
            <Field id="email" label="Email" error={errors.email?.message}>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                aria-invalid={!!errors.email}
                {...register("email")}
              />
            </Field>
            <Button type="submit" variant="primary" disabled={isSubmitting} className="mt-1 w-full">
              {isSubmitting && <Loader2 className="animate-spin" />}
              Send reset link
            </Button>
          </form>
        </>
      )}
      <p className="mt-6 text-center text-sm text-ink-3">
        <Link href="/login" className="font-medium text-brand underline-offset-4 hover:underline">
          Back to sign in
        </Link>
      </p>
    </>
  );
}
