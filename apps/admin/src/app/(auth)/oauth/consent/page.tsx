import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { API_URL } from "@/lib/api/api-url";
import { serverApi } from "@/lib/api/server";
import {
  clientDisplayName,
  clientHosts,
  pickerScopes,
  toSearchParams,
} from "@/lib/auth/oauth-flow";
import { getServerSession } from "@/lib/auth/server-session";
import { ConsentForm } from "./consent-form";

export const metadata: Metadata = { title: "Connect an app — Headless LMS" };

type Search = Record<string, string | string[] | undefined>;

async function clientName(clientId: string): Promise<string> {
  if (!clientId) return clientId;
  const cookie = (await headers()).get("cookie") ?? "";
  try {
    const res = await fetch(
      `${API_URL}/api/auth/oauth2/public-client?client_id=${encodeURIComponent(clientId)}`,
      { headers: { cookie }, cache: "no-store" },
    );
    return clientDisplayName(clientId, res.ok, res.ok ? await res.json() : null);
  } catch {
    return clientId;
  }
}

export default async function ConsentPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const session = await getServerSession();
  const query = toSearchParams(sp).toString();
  if (!session) redirect(`/login?${query}`);
  if (session.status !== "authenticated" || !session.organization) {
    redirect(
      session.organizations.length > 0 ? `/onboarding/select-organization?${query}` : "/onboarding",
    );
  }

  const clientId = typeof sp.client_id === "string" ? sp.client_id : "";
  const requested = typeof sp.scope === "string" ? sp.scope : "";
  const [name, options] = await Promise.all([clientName(clientId), serverApi.listAccessScopes()]);
  const scopes = pickerScopes(requested, options);
  const offlineAccess = requested.split(" ").includes("offline_access");
  const org = session.organization.name;
  const { redirectHost, clientIdHost } = clientHosts(sp);
  const origin = [
    redirectHost && `Returns you to ${redirectHost}`,
    clientIdHost && `Published at ${clientIdHost}`,
  ].filter(Boolean);

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight text-ink text-balance">
          Connect {name}
        </h1>
        {origin.length > 0 && (
          <p className="text-sm text-ink-3 text-pretty">{origin.join(" · ")}</p>
        )}
        <p className="text-sm text-ink-3 text-pretty">
          {scopes.length > 0
            ? `${name} will act in ${org} as you. Choose what it can do.`
            : `${name} asked only for access your role in ${org} doesn't include.`}
        </p>
        {session.organizations.length > 1 && (
          <Link
            href={`/onboarding/select-organization?${query}`}
            className="self-start text-sm font-medium text-brand underline-offset-4 hover:underline"
          >
            Choose another organization
          </Link>
        )}
      </div>
      <ConsentForm scopes={scopes} offlineAccess={offlineAccess} />
    </>
  );
}
