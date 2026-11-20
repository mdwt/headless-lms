"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AlertTriangle, Loader2, MailCheck } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth/client";
import { withNext } from "@/lib/next-path";

const schema = z.object({ email: z.email("Enter your email address") });
type Values = z.infer<typeof schema>;

export function ForgotPasswordForm({ next }: { next: string | null }) {
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: "" } });

  async function onSubmit(values: Values) {
    setError(null);
    const { error: authError } = await authClient.requestPasswordReset({
      email: values.email,
      redirectTo: `${window.location.origin}${withNext("/reset-password", next)}`,
    });
    if (authError) {
      setError(authError.message ?? "Couldn't send the email. Try again.");
      return;
    }
    setSentTo(values.email);
  }

  if (sentTo) {
    return (
      <Alert variant="info" className="mt-6">
        <MailCheck />
        <AlertDescription>
          If <strong className="font-medium">{sentTo}</strong> has an account here, a link to choose
          a new password is on its way.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="mt-6 flex flex-col gap-4" noValidate>
        {error && (
          <Alert variant="destructive">
            <AlertTriangle />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  autoFocus
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button
          type="submit"
          variant="brand"
          className="mt-1 w-full"
          disabled={form.formState.isSubmitting}
        >
          {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
          Email me a reset link
        </Button>
      </form>
    </Form>
  );
}
