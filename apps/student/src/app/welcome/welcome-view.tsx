"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Loader2 } from "lucide-react";

import { authClient, signIn, signUp } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Stage = "activating" | "create" | "signin" | "invalid";

export function WelcomeView() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const email = params.get("email") ?? "";
  const [stage, setStage] = React.useState<Stage>("activating");
  const [error, setError] = React.useState<string | null>(null);

  // Stage the invite token: logged out → better-invite stores it in a signed
  // cookie and the sign-up/in that follows consumes it; already logged in →
  // it is consumed right here and the account is linked.
  React.useEffect(() => {
    if (!token) {
      setStage("invalid");
      return;
    }
    let cancelled = false;
    authClient.invite
      .activate({ token, callbackURL: "/" })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setError(error.message ?? "This invitation link is invalid or has expired.");
          setStage("invalid");
          return;
        }
        if (data?.action === "SIGN_IN_UP_REQUIRED") {
          setStage("create");
        } else {
          // Session existed — invite consumed and linked; straight in.
          router.replace("/");
        }
      })
      .catch(() => {
        if (cancelled) return;
        setError("This invitation link is invalid or has expired.");
        setStage("invalid");
      });
    return () => {
      cancelled = true;
    };
  }, [token, router]);

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      {/* Form column */}
      <div className="flex flex-col bg-surface">
        <div className="flex h-16 items-center px-6 sm:px-10">
          <span className="text-lg font-semibold tracking-tight text-ink">Headless LMS</span>
        </div>
        <div className="flex flex-1 items-center justify-center px-6 py-10 sm:px-10">
          <div className="w-full max-w-xs">
            {stage === "activating" && (
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <Loader2 className="size-6 animate-spin text-ink-3" />
                <p className="text-sm text-ink-3">Checking your invitation…</p>
              </div>
            )}

            {stage === "invalid" && (
              <div className="flex flex-col gap-1.5">
                <h1 className="text-2xl font-semibold tracking-tight text-ink text-balance">
                  Invitation not found
                </h1>
                <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-quiz-wrong-border bg-quiz-wrong-bg px-3 py-2.5 text-sm text-quiz-wrong-fg">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  <p>{error ?? "This invitation link is invalid or has expired."}</p>
                </div>
                <p className="mt-4 text-sm text-ink-3 text-pretty">
                  Ask the course admin for a new invite.
                </p>
              </div>
            )}

            {stage === "create" && (
              <>
                <div className="flex flex-col gap-1.5">
                  <h1 className="text-2xl font-semibold tracking-tight text-ink text-balance">
                    Welcome
                  </h1>
                  <p className="text-sm text-ink-3 text-pretty">
                    You&apos;ve been invited. Create your account to start learning.
                  </p>
                </div>
                <CreateAccountForm email={email} onDone={() => router.replace("/")} />
                <p className="mt-6 text-center text-sm text-ink-3">
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
                <div className="flex flex-col gap-1.5">
                  <h1 className="text-2xl font-semibold tracking-tight text-ink text-balance">
                    Sign in to accept
                  </h1>
                  <p className="text-sm text-ink-3 text-pretty">
                    This invite matches an existing account. Sign in to link it and start
                    learning.
                  </p>
                </div>
                <SignInForm email={email} onDone={() => router.replace("/")} />
                <p className="mt-6 text-center text-sm text-ink-3">
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

      {/* Showcase column — calm dark panel */}
      <div className="relative hidden overflow-hidden bg-ink lg:block">
        <div className="absolute inset-0 [background-image:linear-gradient(to_right,rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:32px_32px]" />
        <div className="relative flex h-full flex-col justify-end p-12">
          <blockquote className="max-w-md">
            <p className="text-2xl font-medium tracking-tight text-surface text-balance">
              Your courses, in one calm place. Pick up right where you left off.
            </p>
            <footer className="mt-4 text-sm text-surface/60">Headless LMS · Course platform</footer>
          </blockquote>
        </div>
      </div>
    </div>
  );
}

function CreateAccountForm({ email, onDone }: { email: string; onDone: () => void }) {
  const [name, setName] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error } = await signUp.email({ email, password, name });
    if (error) {
      setError(error.message ?? "Couldn't create your account");
      setSubmitting(false);
      return;
    }
    onDone();
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4" noValidate>
      {error && (
        <div className="flex items-start gap-2.5 rounded-lg border border-quiz-wrong-border bg-quiz-wrong-bg px-3 py-2.5 text-sm text-quiz-wrong-fg">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>{error}</p>
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="name" className="text-sm font-medium text-ink">
          Name
        </label>
        <input
          id="name"
          type="text"
          autoComplete="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm font-medium text-ink">
          Email
        </label>
        <input
          id="email"
          type="email"
          value={email}
          readOnly
          className={cn(inputClass, "cursor-not-allowed text-ink-3")}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm font-medium text-ink">
          Password
        </label>
        <input
          id="password"
          type="password"
          autoComplete="new-password"
          placeholder="At least 8 characters"
          minLength={8}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
        />
      </div>
      <Button type="submit" variant="brand" disabled={submitting} className="mt-1 w-full">
        {submitting && <Loader2 className="animate-spin" />}
        Create account
      </Button>
    </form>
  );
}

function SignInForm({ email, onDone }: { email: string; onDone: () => void }) {
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error } = await signIn.email({ email, password });
    if (error) {
      setError(error.message ?? "Invalid email or password");
      setSubmitting(false);
      return;
    }
    onDone();
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4" noValidate>
      {error && (
        <div className="flex items-start gap-2.5 rounded-lg border border-quiz-wrong-border bg-quiz-wrong-bg px-3 py-2.5 text-sm text-quiz-wrong-fg">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>{error}</p>
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="signin-email" className="text-sm font-medium text-ink">
          Email
        </label>
        <input
          id="signin-email"
          type="email"
          value={email}
          readOnly
          className={cn(inputClass, "cursor-not-allowed text-ink-3")}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="signin-password" className="text-sm font-medium text-ink">
          Password
        </label>
        <input
          id="signin-password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
        />
      </div>
      <Button type="submit" variant="brand" disabled={submitting} className="mt-1 w-full">
        {submitting && <Loader2 className="animate-spin" />}
        Sign in
      </Button>
    </form>
  );
}

const inputClass = cn(
  "h-9 w-full rounded-md border border-line-btn bg-surface px-3 text-sm text-ink",
  "placeholder:text-ink-faint transition-colors outline-none",
  "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30",
);
