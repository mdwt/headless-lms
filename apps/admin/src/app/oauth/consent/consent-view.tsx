"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Logo } from "@/components/app-shell/logo";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/**
 * Landing page for the MCP OAuth consent redirect
 * (`/oauth/consent?consent_code=…&client_id=…&scope=…`). Answers the prompt via
 * `POST /api/auth/oauth2/consent`; better-auth then redirects back to the client.
 */
export function ConsentView() {
  const params = useSearchParams();
  const consentCode = params.get("consent_code") ?? "";
  const clientId = params.get("client_id") ?? "";
  const scopes = (params.get("scope") ?? "").split(" ").filter(Boolean);
  const [pending, setPending] = React.useState<"allow" | "deny" | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function respond(accept: boolean) {
    setPending(accept ? "allow" : "deny");
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/auth/oauth2/consent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ accept, consent_code: consentCode }),
      });
      if (!res.ok) {
        setError(`Request failed (${res.status})`);
        setPending(null);
        return;
      }
      const data = (await res.json()) as { redirectURI?: string };
      if (data.redirectURI) {
        window.location.assign(data.redirectURI);
        return;
      }
      setError("Authorization failed: no redirect received.");
      setPending(null);
    } catch {
      setError("Network error. Please try again.");
      setPending(null);
    }
  }

  return (
    <div className="grid min-h-dvh place-items-center bg-page px-4">
      <div className="w-full max-w-sm">
        <div className="flex justify-center">
          <Logo org="Headless LMS" />
        </div>
        <div className="mt-6 rounded-card border border-line bg-surface p-6">
          {consentCode ? (
            <>
              <h1 className="text-base font-semibold text-ink">
                {clientId || "An application"} wants access
              </h1>
              <p className="mt-1 text-sm text-ink-2">
                This app is requesting the following permissions:
              </p>
              <ul className="mt-3 list-disc pl-5 text-sm text-ink-2">
                {scopes.map((scope) => (
                  <li key={scope}>{scope}</li>
                ))}
              </ul>
              <div className="mt-6 flex gap-3">
                <Button
                  variant="primary"
                  className="flex-1"
                  disabled={pending !== null}
                  onClick={() => respond(true)}
                >
                  {pending === "allow" ? <Loader2 className="animate-spin" /> : null}
                  Allow
                </Button>
                <Button
                  className="flex-1"
                  disabled={pending !== null}
                  onClick={() => respond(false)}
                >
                  {pending === "deny" ? <Loader2 className="animate-spin" /> : null}
                  Deny
                </Button>
              </div>
              {error ? (
                <p className="mt-4 flex items-center gap-2 text-sm text-danger">
                  <AlertTriangle className="size-4" />
                  {error}
                </p>
              ) : null}
            </>
          ) : (
            <p className="flex items-center gap-2 text-sm text-danger">
              <AlertTriangle className="size-4" />
              This authorization link is invalid or has expired.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
