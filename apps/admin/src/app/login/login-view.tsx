"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AlertTriangle, Loader2 } from "lucide-react";

import { DEMO_USERS, signIn, useSession } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/app-shell/logo";

const schema = z.object({
  email: z.string().min(1, "Email is required").email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});
type FormValues = z.infer<typeof schema>;

export function LoginView() {
  const router = useRouter();
  const params = useSearchParams();
  const denied = params.get("denied") === "1";
  const { data: session } = useSession();

  const {
    register,
    handleSubmit,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  // Already signed in → leave the login page.
  React.useEffect(() => {
    if (session && session.user.role !== "student") router.replace("/");
  }, [session, router]);

  async function onSubmit(values: FormValues) {
    const { error } = await signIn.email(values);
    if (error) {
      setError("password", { message: error.message });
      return;
    }
    router.replace("/");
  }

  function quickFill(email: string) {
    setValue("email", email, { shouldValidate: true });
    setValue("password", "password", { shouldValidate: true });
  }

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
                Sign in to manage
              </h1>
              <p className="text-sm text-ink-3 text-pretty">
                Welcome back. Enter your credentials to access the back office.
              </p>
            </div>

            {denied && (
              <div className="mt-5 flex items-start gap-2.5 rounded-lg border border-warning/20 bg-warning-soft px-3 py-2.5 text-sm text-warning">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <p>That account doesn&apos;t have access to the management dashboard.</p>
              </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} className="mt-6 flex flex-col gap-4" noValidate>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@atelier.academy"
                  aria-invalid={!!errors.email}
                  {...register("email")}
                />
                {errors.email && <p className="text-sm text-danger">{errors.email.message}</p>}
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <a href="#" className="text-sm text-ink-3 underline-offset-4 hover:text-ink hover:underline">
                    Forgot?
                  </a>
                </div>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  aria-invalid={!!errors.password}
                  {...register("password")}
                />
                {errors.password && <p className="text-sm text-danger">{errors.password.message}</p>}
              </div>

              <Button type="submit" variant="primary" disabled={isSubmitting} className="mt-1 w-full">
                {isSubmitting && <Loader2 className="animate-spin" />}
                Sign in
              </Button>

              <div className="relative py-1 text-center">
                <span className="relative z-10 bg-surface px-2 text-xs text-ink-4">or</span>
                <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-line" aria-hidden="true" />
              </div>

              <Button
                type="button"
                variant="secondary"
                className="w-full"
                onClick={() => signIn.social({ provider: "google" }).then((r) => {
                  if (r.error) setError("password", { message: r.error.message });
                })}
              >
                <GoogleMark />
                Continue with Google
              </Button>
            </form>

            {/* Demo accounts — preview each role's view */}
            <div className="mt-8 rounded-lg border border-line bg-surface-2 p-3">
              <p className="text-xs font-medium text-ink-3">Demo accounts · password is “password”</p>
              <div className="mt-2 flex flex-col gap-1">
                {Object.entries(DEMO_USERS).map(([email, { label }]) => (
                  <button
                    key={email}
                    type="button"
                    onClick={() => quickFill(email)}
                    className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-sm text-ink-2 outline-none transition-colors hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring/40"
                  >
                    <span className="truncate font-medium text-ink">{email}</span>
                    <span className="shrink-0 text-xs text-ink-4">{label.split(" — ")[0]}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Showcase column — calm dark panel, structural not decorative */}
      <div className="relative hidden overflow-hidden bg-ink lg:block">
        <div className="absolute inset-0 [background-image:linear-gradient(to_right,rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:32px_32px]" />
        <div className="relative flex h-full flex-col justify-end p-12">
          <blockquote className="max-w-md">
            <p className="text-2xl font-medium tracking-tight text-surface text-balance">
              Everything your team needs to run courses — content, enrollments, and grading in one calm place.
            </p>
            <footer className="mt-4 text-sm text-surface/60">
              Atelier Academy · Management dashboard
            </footer>
          </blockquote>
        </div>
      </div>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z" />
    </svg>
  );
}
