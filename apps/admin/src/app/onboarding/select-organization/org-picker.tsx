"use client";

import { useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";

import { authClient } from "@/lib/auth/client";
import { EXPIRED_SIGN_IN_LINK, isExpiredSignInLink } from "@/lib/auth/oauth-flow";

type Org = { id: string; name: string; slug: string };

export function OrgPicker({ organizations, oauth }: { organizations: Org[]; oauth?: boolean }) {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function choose(organizationId: string) {
    setError(null);
    setPending(organizationId);
    const { error: failure } = await authClient.organization.setActive({ organizationId });
    if (failure) {
      setPending(null);
      setError(
        isExpiredSignInLink(failure)
          ? EXPIRED_SIGN_IN_LINK
          : (failure.message ?? "Couldn't switch to that organization"),
      );
      return;
    }
    if (oauth) return;
    // Back to the decision point, not straight to the dashboard: it re-resolves
    // the session and routes on what actually landed.
    window.location.assign("/onboarding");
  }

  return (
    <div className="mt-5 flex flex-col gap-2">
      {error && (
        <div className="flex items-start gap-2.5 rounded-lg border border-danger/20 bg-danger-soft px-3 py-2.5 text-sm text-danger">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>{error}</p>
        </div>
      )}
      {organizations.map((org) => (
        <button
          key={org.id}
          type="button"
          disabled={pending !== null}
          onClick={() => void choose(org.id)}
          className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2.5 text-left hover:bg-surface-2 disabled:opacity-60"
        >
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium text-ink">{org.name}</span>
            <span className="truncate text-xs text-ink-4">{org.slug}</span>
          </span>
          {pending === org.id && <Loader2 className="size-4 shrink-0 animate-spin text-ink-3" />}
        </button>
      ))}
    </div>
  );
}
