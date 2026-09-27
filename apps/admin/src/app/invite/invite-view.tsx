"use client";

import { useEffect, useRef, useState } from "react";
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

async function getInvite(token: string): Promise<{ email: string } | null> {
  const res = await fetch(`${API_URL}/api/organizations/invites/${encodeURIComponent(token)}`, {
    credentials: "include",
  });
  if (!res.ok) return null;
  return (await res.json()) as { email: string };
}

/** Claims the invite for the fresh session, then refreshes the cookie cache. */
async function acceptInvite(token: string): Promise<boolean> {
  const res = await fetch(`${API_URL}/api/organizations/invites/accept`, {
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
 * Landing page for staff invite links (`/invite?token=…`). Same flow as the
 * student portal's `/welcome`: the token is read to find the invited email, then
 * sign-up/in followed by an explicit accept call grants the membership.
 */
export function InviteView() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [email, setEmail] = useState("");
  const [stage, setStage] = useState<Stage>("activating");
  const [error, setError] = useState<string | null>(null);
  const loadStarted = useRef(false);

  useEffect(() => {
    if (!token) {
      setStage("invalid");
      return;
    }
    // Strict-mode double-mount fires this effect twice; the invite load must run once.
    // Results apply unconditionally — the ref keeps the call single-flight, and the strict-mode remount wants this exact result.
    if (loadStarted.current) return;
    loadStarted.current = true;
    getInvite(token)
      .then(async (invite) => {
        if (!invite) {
          setStage("invalid");
          return;
        }
        const session = await authClient.getSession();
        if (session.data) {
          if (await acceptInvite(token)) {
            window.location.assign("/");
            return;
          }
          setError("Signed in, but the invitation could not be accepted.");
          setStage("invalid");
          return;
        }
        setEmail(invite.email);
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
              <CreateAccountForm
                email={email}
                token={token}
                onAccountExists={() => setStage("signin")}
              />
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

function CreateAccountForm({
  email,
  token,
  onAccountExists,
}: {
  email: string;
  token: string;
  onAccountExists: () => void;
}) {
  const [formError, setFormError] = useState<string | null>(null);
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
    if (error && (error.code?.startsWith("USER_ALREADY_EXISTS") || error.status === 422)) {
      onAccountExists();
      return;
    }
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
  const [formError, setFormError] = useState<string | null>(null);
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
