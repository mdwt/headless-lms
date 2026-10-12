"use client";

import { useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";

import { ScopePicker } from "@/components/forms/scope-picker";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";
import { defaultSelected } from "@/lib/auth/oauth-flow";

export function ConsentForm({
  scopes,
  offlineAccess,
}: {
  scopes: string[];
  offlineAccess: boolean;
}) {
  const [selected, setSelected] = useState(() => scopes.filter(defaultSelected));
  const [pending, setPending] = useState<"allow" | "deny" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(accept: boolean) {
    setError(null);
    setPending(accept ? "allow" : "deny");
    const scope = [...selected, ...(offlineAccess ? ["offline_access"] : [])].join(" ");
    const { error: failure } = await authClient.oauth2.consent(
      accept ? { accept, scope } : { accept },
    );
    if (failure) {
      setPending(null);
      setError(failure.message ?? "Couldn't record your decision");
    }
  }

  return (
    <div className="mt-6 flex flex-col gap-6">
      {scopes.length > 0 && <ScopePicker scopes={scopes} value={selected} onChange={setSelected} />}
      <div className="flex flex-col gap-3">
        {error && (
          <div className="flex items-start gap-2.5 rounded-lg border border-danger/20 bg-danger-soft px-3 py-2.5 text-sm text-danger">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <p>{error}</p>
          </div>
        )}
        {scopes.length > 0 && (
          <Button
            variant="primary"
            className="w-full"
            disabled={pending !== null || selected.length === 0}
            onClick={() => void decide(true)}
          >
            {pending === "allow" && <Loader2 className="animate-spin" />}
            Allow
          </Button>
        )}
        <Button
          variant="ghost"
          className="w-full"
          disabled={pending !== null}
          onClick={() => void decide(false)}
        >
          {pending === "deny" && <Loader2 className="animate-spin" />}
          Deny
        </Button>
      </div>
    </div>
  );
}
