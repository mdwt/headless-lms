"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Loader2 } from "lucide-react";

import { signIn, signOut, useSession } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function LoginView() {
  const router = useRouter();
  const params = useSearchParams();
  // Where the proxy wanted the user to land before it bounced them here.
  // Only accept in-app absolute paths to avoid an open-redirect.
  const nextParam = params.get("next");
  const next =
    nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/";
  const reset = params.get("reset") === "1";
  const { data: session } = useSession();
  const resetHandled = React.useRef(false);
  // Held so a sign-in submitted while the reset sign-out is still in flight
  // waits for it — otherwise the late sign-out can revoke the fresh session.
  const resetSignOut = React.useRef<Promise<unknown> | null>(null);

  React.useEffect(() => {
    if (reset) {
      // The API said this session doesn't resolve to a portal student — drop it in
      // the background and stay on ?reset=1 showing the clean form. No navigation:
      // stripping the param while better-auth's session signal is still stale-truthy
      // would re-enable the next-redirect below and bounce. Signing in is the exit.
      if (!resetHandled.current) {
        resetHandled.current = true;
        resetSignOut.current = signOut().catch(() => {
          // Best-effort: the form is usable either way; the server already rejected the session.
        });
      }
      return;
    }
    if (session) router.replace(next);
  }, [session, reset, router, next]);

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      {/* Form column */}
      <div className="flex flex-col bg-surface">
        <div className="flex h-16 items-center px-6 sm:px-10">
          <span className="text-lg font-semibold tracking-tight text-ink">Headless LMS</span>
        </div>
        <div className="flex flex-1 items-center justify-center px-6 py-10 sm:px-10">
          <div className="w-full max-w-xs">
            <div className="flex flex-col gap-1.5">
              <h1 className="text-2xl font-semibold tracking-tight text-ink text-balance">
                Sign in
              </h1>
              <p className="text-sm text-ink-3 text-pretty">
                Welcome back. Enter your credentials to continue your courses.
              </p>
            </div>
            <SignInForm
              beforeSignIn={() => resetSignOut.current ?? Promise.resolve()}
              onDone={() => router.replace(next)}
            />
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

function SignInForm({
  beforeSignIn,
  onDone,
}: {
  beforeSignIn: () => Promise<unknown>;
  onDone: () => void;
}) {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    await beforeSignIn();
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
        <label htmlFor="email" className="text-sm font-medium text-ink">
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm font-medium text-ink">
          Password
        </label>
        <input
          id="password"
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
