"use client";

import { Info } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { AuthHeading } from "@/components/auth/auth-shell";
import { authClient } from "@/lib/auth/client";
import { acceptInvite } from "@/app/welcome/actions";
import { CreateAccountForm, type CreateAccountOutcome } from "./create-account-form";
import { SignInForm } from "./sign-in-form";
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

type Mode = "create" | "signin";

export function InviteAuthForm({
  token,
  email,
  name,
}: {
  token: string;
  email: string;
  /** What the admin who added them entered — prefills sign-up. */
  name: string;
}) {
  const router = useRouter();
  // Always offer sign-up first. Nothing here knows whether the address already
  // has a login: the domain has a person for every invited student well before
  // they have an account, and asking the auth engine would mean reading its
  // tables for one boolean. A duplicate signup is refused, and that refusal is
  // what moves us to sign-in — one round trip, only for the rarer case.
  const [mode, setMode] = useState<Mode>("create");
  // Set once a signup came back "already registered".
  const [fellBack, setFellBack] = useState(false);

  /** Returns an error message, or null once the portal has been entered. */
  const accept = useCallback(async () => {
    const failure = await acceptInvite(token);
    if (failure) return failure.error;
    // The cached session predates the org the accept just stamped.
    await authClient.getSession({ query: { disableCookieCache: true } });
    router.replace("/");
    return null;
  }, [token, router]);

  const onCreateOutcome = useCallback(
    async (outcome: CreateAccountOutcome) => {
      if (outcome === "account-exists") {
        setFellBack(true);
        setMode("signin");
        return null;
      }
      return accept();
    },
    [accept],
  );

  if (mode === "signin") {
    return (
      <>
        <AuthHeading title="Sign in to accept">
          {fellBack
            ? "This address already has an account."
            : "Sign in to link this invitation to your account."}
        </AuthHeading>

        {fellBack && (
          <Alert variant="info" className="mt-4">
            <Info />
            <AlertDescription>
              Enter the password for your existing account to accept the invitation.
            </AlertDescription>
          </Alert>
        )}

        <SignInForm email={email} onSignedIn={accept} />

        <ModeSwitch
          prompt="Need a new account instead?"
          action="Create account"
          onClick={() => {
            setFellBack(false);
            setMode("create");
          }}
        />
      </>
    );
  }

  return (
    <>
      <AuthHeading title="Welcome">
        You&apos;ve been invited. Create your account to start learning.
      </AuthHeading>

      <CreateAccountForm email={email} name={name} onOutcome={onCreateOutcome} />

      <ModeSwitch
        prompt="Already have an account?"
        action="Sign in"
        onClick={() => setMode("signin")}
      />
    </>
  );
}

function ModeSwitch({
  prompt,
  action,
  onClick,
}: {
  prompt: string;
  action: string;
  onClick: () => void;
}) {
  return (
    <p className="mt-6 text-center text-sm text-ink-3">
      {prompt}{" "}
      <button
        type="button"
        onClick={onClick}
        className="font-medium text-brand underline-offset-4 hover:underline"
      >
        {action}
      </button>
    </p>
  );
}
