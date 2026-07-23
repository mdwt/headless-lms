"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AlertTriangle, Loader2 } from "lucide-react";

import { authClient, signIn, signUp } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/app-shell/logo";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type Stage = "activating" | "create" | "signin" | "invalid";

/** Stages the token in the API's activation cookie (or consumes it when a session exists). */
async function activateInvite(
  token: string,
): Promise<{ status: "accepted" | "auth-required" } | { error: string }> {
  const res = await fetch(`${API_URL}/api/invites/activate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ token }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    return { error: body?.error ?? "This invitation link is invalid or has expired." };
  }
  return (await res.json()) as { status: "accepted" | "auth-required" };
}

/** Claims the invite for the fresh session, then refreshes the cookie cache. */
async function acceptInvite(token: string): Promise<boolean> {
  const res = await fetch(`${API_URL}/api/invites/accept`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ token }),
  });
  if (!res.ok) return false;
  await authClient.getSession({ query: { disableCookieCache: true } });
  return true;
}

const signUpSchema = z.object({
  name: z.string().min(2, "Your name is required"),
  password: z.string().min(8, "Use at least 8 characters"),
});
type SignUpValues = z.infer<typeof signUpSchema>;

const signInSchema = z.object({
  password: z.string().min(1, "Password is required"),
});
type SignInValues = z.infer<typeof signInSchema>;

/**
 * Landing page for staff invite links (`/invite?token=…&email=…`). Same stage
 * machine as the student portal's `/welcome`, but signup here is open (no
 * invite-only gate) — the staged cookie is consumed by the after-hook on
 * sign-up/in and `afterAcceptInvite` adds the org membership.
 */
export function InviteView() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const email = params.get("email") ?? "";
  const [stage, setStage] = React.useState<Stage>("activating");
  const [error, setError] = React.useState<string | null>(null);
  const activateStarted = React.useRef(false);

  React.useEffect(() => {
    if (!token) {
      setStage("invalid");
      return;
    }
    // Strict-mode double-mount fires this effect twice; the token activate must run once.
    // Results apply unconditionally — the ref keeps the call single-flight, and the strict-mode remount wants this exact result.
    if (activateStarted.current) return;
    activateStarted.current = true;
    activateInvite(token)
      .then((result) => {
        if ("error" in result) {
          setError(result.error);
          setStage("invalid");
          return;
        }
        if (result.status === "accepted") {
          // Session existed — invite consumed and the membership was added.
          // Full reload so the server session resolver picks up the new org.
          window.location.assign("/");
          return;
        }
        setStage("create");
      })
      .catch(() => {
        setError("This invitation link is invalid or has expired.");
        setStage("invalid");
      });
  }, [token]);

  return (
    <div className="grid min-h-dvh place-items-center bg-page px-4">
      <div className="w-full max-w-sm">
        <div className="flex justify-center">
          <Logo org="Headless LMS" />
        </div>
        <div className="mt-6 rounded-card border border-line bg-surface p-6">
          {stage === "activating" && (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <Loader2 className="size-6 animate-spin text-ink-3" />
              <p className="text-sm text-ink-3">Checking your invitation…</p>
            </div>
          )}

          {stage === "invalid" && (
            <div className="flex flex-col gap-1">
              <h1 className="text-lg font-semibold tracking-tight text-ink">
                Invitation not found
              </h1>
              <div className="mt-3 flex items-start gap-2.5 rounded-lg border border-danger/20 bg-danger-soft px-3 py-2.5 text-sm text-danger">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <p>{error ?? "This invitation link is invalid or has expired."}</p>
              </div>
              <p className="mt-3 text-sm text-ink-3 text-pretty">
                Ask whoever invited you for a new invite.
              </p>
            </div>
          )}

          {stage === "create" && (
            <>
              <div className="flex flex-col gap-1">
                <h1 className="text-lg font-semibold tracking-tight text-ink">Join the team</h1>
                <p className="text-sm text-ink-3 text-pretty">
                  You&apos;ve been invited to an organization. Create your account or sign in to
                  accept.
                </p>
              </div>
              <CreateAccountForm email={email} token={token} />
              <p className="mt-4 text-center text-sm text-ink-3">
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={() => setStage("signin")}
                  className="font-medium text-brand underline-offset-4 hover:underline"
                >
                  Sign in
                </button>
              </p>
            </>
          )}

          {stage === "signin" && (
            <>
              <div className="flex flex-col gap-1">
                <h1 className="text-lg font-semibold tracking-tight text-ink">Join the team</h1>
                <p className="text-sm text-ink-3 text-pretty">
                  You&apos;ve been invited to an organization. Create your account or sign in to
                  accept.
                </p>
              </div>
              <SignInForm email={email} token={token} />
              <p className="mt-4 text-center text-sm text-ink-3">
                Need to create an account instead?{" "}
                <button
                  type="button"
                  onClick={() => setStage("create")}
                  className="font-medium text-brand underline-offset-4 hover:underline"
                >
                  Create account
                </button>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function CreateAccountForm({ email, token }: { email: string; token: string }) {
  const [formError, setFormError] = React.useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { name: "", password: "" },
  });

  async function onSubmit(values: SignUpValues) {
    setFormError(null);
    const { error } = await signUp.email({ email, password: values.password, name: values.name });
    if (error) {
      setFormError(error.message ?? "Couldn't create your account");
      return;
    }
    if (!(await acceptInvite(token))) {
      setFormError("Your account was created, but the invitation could not be accepted.");
      return;
    }
    // The membership landed on the session server-side; a full reload lets the
    // server session resolver re-run and render the dashboard.
    window.location.assign("/");
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="mt-5 flex flex-col gap-4" noValidate>
      {formError && (
        <div className="flex items-start gap-2.5 rounded-lg border border-danger/20 bg-danger-soft px-3 py-2.5 text-sm text-danger">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>{formError}</p>
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Your name</Label>
        <Input id="name" autoComplete="name" aria-invalid={!!errors.name} {...register("name")} />
        {errors.name && <p className="text-sm text-danger">{errors.name.message}</p>}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="invite-email">Email</Label>
        <Input id="invite-email" type="email" value={email} readOnly disabled />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          placeholder="At least 8 characters"
          aria-invalid={!!errors.password}
          {...register("password")}
        />
        {errors.password && <p className="text-sm text-danger">{errors.password.message}</p>}
      </div>
      <Button type="submit" variant="primary" disabled={isSubmitting} className="mt-1 w-full">
        {isSubmitting && <Loader2 className="animate-spin" />}
        Create account
      </Button>
    </form>
  );
}

function SignInForm({ email, token }: { email: string; token: string }) {
  const [formError, setFormError] = React.useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { password: "" },
  });

  async function onSubmit(values: SignInValues) {
    setFormError(null);
    const { error } = await signIn.email({ email, password: values.password });
    if (error) {
      setFormError(error.message ?? "Invalid email or password");
      return;
    }
    if (!(await acceptInvite(token))) {
      setFormError("Signed in, but the invitation could not be accepted.");
      return;
    }
    // The membership landed on the session server-side; full reload so the
    // server session resolver picks it up.
    window.location.assign("/");
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="mt-5 flex flex-col gap-4" noValidate>
      {formError && (
        <div className="flex items-start gap-2.5 rounded-lg border border-danger/20 bg-danger-soft px-3 py-2.5 text-sm text-danger">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>{formError}</p>
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="signin-email">Email</Label>
        <Input id="signin-email" type="email" value={email} readOnly disabled />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="signin-password">Password</Label>
        <Input
          id="signin-password"
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
    </form>
  );
}
