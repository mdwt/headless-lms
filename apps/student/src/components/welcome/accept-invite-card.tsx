"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { authClient, signOut } from "@/lib/auth/client";
import { acceptInvite } from "@/app/welcome/actions";
import { useRouter } from "next/navigation";

/**
 * The invitee already has a session. Accepting is a write, so it takes a
 * deliberate click rather than firing during render — which also gives someone
 * signed in as the wrong person a chance to notice before linking the invite.
 */
export function AcceptInviteCard({
  token,
  invitedEmail,
  sessionEmail,
}: {
  token: string;
  invitedEmail: string;
  sessionEmail: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const mismatch = invitedEmail.toLowerCase() !== sessionEmail.toLowerCase();

  function onAccept() {
    setError(null);
    startTransition(async () => {
      const failure = await acceptInvite(token);
      if (failure) {
        setError(failure.error);
        return;
      }
      // The cached session predates the org the accept just stamped.
      await authClient.getSession({ query: { disableCookieCache: true } });
      router.replace("/");
    });
  }

  return (
    <div className="mt-6 flex flex-col gap-4">
      {error && (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {mismatch && (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertDescription>
            This invitation was sent to <strong className="font-medium">{invitedEmail}</strong>, but
            you&apos;re signed in as <strong className="font-medium">{sessionEmail}</strong>. Switch
            accounts to accept it.
          </AlertDescription>
        </Alert>
      )}

      <Button
        type="button"
        variant="brand"
        className="w-full"
        disabled={pending || mismatch}
        onClick={onAccept}
      >
        {pending && <Loader2 className="animate-spin" />}
        Accept invitation
      </Button>

      <button
        type="button"
        onClick={() => void signOut().then(() => router.refresh())}
        className="text-center text-sm text-ink-3 underline-offset-4 hover:text-ink hover:underline"
      >
        Use a different account
      </button>
    </div>
  );
}
