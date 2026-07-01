"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AlertTriangle, Loader2 } from "lucide-react";

import { signIn, signUp, useSession } from "@/lib/auth/client";
import { api } from "@/lib/api/sdk";
import { uniqueOrgSlug } from "@/lib/slug";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/app-shell/logo";

const signInSchema = z.object({
  email: z.string().min(1, "Email is required").email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});
const signUpSchema = z.object({
  name: z.string().min(2, "Your name is required"),
  email: z.string().min(1, "Email is required").email("Enter a valid email"),
  password: z.string().min(8, "Use at least 8 characters"),
  organizationName: z.string().min(2, "Organization name is required"),
});
type SignInValues = z.infer<typeof signInSchema>;
type SignUpValues = z.infer<typeof signUpSchema>;

export function LoginView() {
  const router = useRouter();
  const params = useSearchParams();
  const denied = params.get("denied") === "1";
  const { data: session } = useSession();
  const [mode, setMode] = React.useState<"signin" | "signup">("signin");
  const [formError, setFormError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (session) router.replace("/");
  }, [session, router]);

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      {/* Form column — solid white per login-page rules */}
      <div className="flex flex-col bg-surface">
        <div className="flex h-16 items-center px-6 sm:px-10">
          <Logo org="Atelier Academy" />
        </div>
        <div className="flex flex-1 items-center justify-center px-6 py-10 sm:px-10">
          <div className="w-full max-w-xs">
            <div className="flex flex-col gap-1.5">
              <h1 className="text-2xl font-semibold tracking-tight text-ink text-balance">
                {mode === "signin" ? "Sign in to manage" : "Create your workspace"}
              </h1>
              <p className="text-sm text-ink-3 text-pretty">
                {mode === "signin"
                  ? "Welcome back. Enter your credentials to access the back office."
                  : "Set up your account and organization to get started."}
              </p>
            </div>

            {denied && (
              <div className="mt-5 flex items-start gap-2.5 rounded-lg border border-warning/20 bg-warning-soft px-3 py-2.5 text-sm text-warning">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <p>That account doesn&apos;t have access to the management dashboard.</p>
              </div>
            )}

            {formError && (
              <div className="mt-5 flex items-start gap-2.5 rounded-lg border border-danger/20 bg-danger-soft px-3 py-2.5 text-sm text-danger">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <p>{formError}</p>
              </div>
            )}

            {mode === "signin" ? (
              <SignInForm onError={setFormError} onDone={() => router.replace("/")} />
            ) : (
              <SignUpForm onError={setFormError} onDone={() => router.replace("/")} />
            )}

            <p className="mt-6 text-center text-sm text-ink-3">
              {mode === "signin" ? "New to Atelier?" : "Already have an account?"}{" "}
              <button
                type="button"
                onClick={() => {
                  setFormError(null);
                  setMode(mode === "signin" ? "signup" : "signin");
                }}
                className="font-medium text-brand underline-offset-4 hover:underline"
              >
                {mode === "signin" ? "Create an organization" : "Sign in"}
              </button>
            </p>

            {mode === "signin" && (
              <div className="mt-8 rounded-lg border border-line bg-surface-2 p-3">
                <p className="text-xs font-medium text-ink-3">Seeded demo owner</p>
                <p className="mt-1 text-sm text-ink-2">
                  <span className="font-medium text-ink">mira@atelier.academy</span> · password123
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Showcase column — calm dark panel, structural not decorative */}
      <div className="relative hidden overflow-hidden bg-ink lg:block">
        <div className="absolute inset-0 [background-image:linear-gradient(to_right,rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:32px_32px]" />
        <div className="relative flex h-full flex-col justify-end p-12">
          <blockquote className="max-w-md">
            <p className="text-2xl font-medium tracking-tight text-surface text-balance">
              Everything your team needs to run courses — content and entitlements in one calm place.
            </p>
            <footer className="mt-4 text-sm text-surface/60">Atelier Academy · Management dashboard</footer>
          </blockquote>
        </div>
      </div>
    </div>
  );
}

function SignInForm({ onError, onDone }: { onError: (m: string | null) => void; onDone: () => void }) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignInValues>({ resolver: zodResolver(signInSchema), defaultValues: { email: "", password: "" } });

  async function onSubmit(values: SignInValues) {
    onError(null);
    const { error } = await signIn.email(values);
    if (error) {
      onError(error.message ?? "Invalid email or password");
      return;
    }
    onDone();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="mt-6 flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" autoComplete="email" placeholder="you@atelier.academy" aria-invalid={!!errors.email} {...register("email")} />
        {errors.email && <p className="text-sm text-danger">{errors.email.message}</p>}
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Password</Label>
          <a href="#" className="text-sm text-ink-3 underline-offset-4 hover:text-ink hover:underline">Forgot?</a>
        </div>
        <Input id="password" type="password" autoComplete="current-password" placeholder="••••••••" aria-invalid={!!errors.password} {...register("password")} />
        {errors.password && <p className="text-sm text-danger">{errors.password.message}</p>}
      </div>
      <Button type="submit" variant="primary" disabled={isSubmitting} className="mt-1 w-full">
        {isSubmitting && <Loader2 className="animate-spin" />}
        Sign in
      </Button>
    </form>
  );
}

function SignUpForm({ onError, onDone }: { onError: (m: string | null) => void; onDone: () => void }) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { name: "", email: "", password: "", organizationName: "" },
  });

  async function onSubmit(values: SignUpValues) {
    onError(null);
    const { error } = await signUp.email({
      email: values.email,
      password: values.password,
      name: values.name,
    });
    if (error) {
      onError(error.message ?? "Couldn't create your account");
      return;
    }
    const slug = uniqueOrgSlug(values.organizationName);
    try {
      // Creates the org and makes it the session's active org, server-side.
      await api.createOrganization({ name: values.organizationName, slug });
    } catch (e) {
      onError(e instanceof Error ? e.message : "Account created, but the organization couldn't be set up");
      return;
    }
    onDone();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="mt-6 flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Your name</Label>
        <Input id="name" autoComplete="name" placeholder="Mira Okonkwo" aria-invalid={!!errors.name} {...register("name")} />
        {errors.name && <p className="text-sm text-danger">{errors.name.message}</p>}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="su-email">Email</Label>
        <Input id="su-email" type="email" autoComplete="email" placeholder="you@atelier.academy" aria-invalid={!!errors.email} {...register("email")} />
        {errors.email && <p className="text-sm text-danger">{errors.email.message}</p>}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="su-password">Password</Label>
        <Input id="su-password" type="password" autoComplete="new-password" placeholder="At least 8 characters" aria-invalid={!!errors.password} {...register("password")} />
        {errors.password && <p className="text-sm text-danger">{errors.password.message}</p>}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="org">Organization name</Label>
        <Input id="org" placeholder="Atelier Academy" aria-invalid={!!errors.organizationName} {...register("organizationName")} />
        {errors.organizationName && <p className="text-sm text-danger">{errors.organizationName.message}</p>}
      </div>
      <Button type="submit" variant="primary" disabled={isSubmitting} className="mt-1 w-full">
        {isSubmitting && <Loader2 className="animate-spin" />}
        Create account
      </Button>
    </form>
  );
}
