"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";

import { signIn, useSession } from "@/lib/auth/client";
import { sameSitePath, withNext } from "@/lib/next-path";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NOT_A_MEMBER = "FAILED_TO_CREATE_SESSION";

export function LoginView({ orgName }: { orgName: string }) {
  const router = useRouter();
  const params = useSearchParams();
  // Where the proxy wanted the user to land before it bounced them here.
  // Only accept in-app absolute paths to avoid an open-redirect.
  const requested = sameSitePath(params.get("next"));
  const next = requested ?? "/";
  const linkFailed = params.has("error");
  const passwordReset = params.has("reset");
  const { data: session } = useSession();

  // A session that reaches this page is one worth honouring. Anything the API
  // rejected was revoked at `/session/reset` before the browser got here, so
  // there is no stale-but-truthy case to second-guess.
  useEffect(() => {
    if (session) router.replace(next);
  }, [session, router, next]);

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      {/* Form column */}
      <div className="flex flex-col bg-surface">
        <div className="flex h-16 items-center px-6 sm:px-10">
          <span className="text-lg font-semibold tracking-tight text-ink">{orgName}</span>
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
            {passwordReset && (
              <Alert className="mt-6">
                <CheckCircle2 />
                <AlertDescription>
                  Your password was changed. Sign in with the new one.
                </AlertDescription>
              </Alert>
            )}
            {linkFailed && (
              <Alert variant="destructive" className="mt-6">
                <AlertTriangle />
                <AlertDescription>
                  That sign-in link didn&apos;t work. It may have expired or been used already.
                </AlertDescription>
              </Alert>
            )}
            <SignInForm orgName={orgName} onDone={() => router.replace(next)} />
            <p className="mt-6 flex flex-col gap-2 text-center text-sm text-ink-3">
              <Link
                href={withNext("/forgot-password", requested)}
                className="font-medium text-brand underline-offset-4 hover:underline"
              >
                Forgot your password?
              </Link>
              <Link
                href={withNext("/sign-in-link", requested)}
                className="font-medium text-brand underline-offset-4 hover:underline"
              >
                Email me a sign-in link
              </Link>
            </p>
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
            <footer className="mt-4 text-sm text-surface/60">{orgName}</footer>
          </blockquote>
        </div>
      </div>
    </div>
  );
}

function SignInForm({ orgName, onDone }: { orgName: string; onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error } = await signIn.email({ email, password });
    if (error) {
      setError(
        error.code === NOT_A_MEMBER
          ? `This account is not a member of ${orgName}.`
          : (error.message ?? "Invalid email or password"),
      );
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
