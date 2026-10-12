import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getServerSession } from "@/lib/auth/server-session";
import { isOAuthFlow } from "@/lib/auth/oauth-flow";
import { OrgPicker } from "./org-picker";

export const metadata: Metadata = { title: "Choose an organization — Headless LMS" };

export default async function SelectOrganizationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const oauth = isOAuthFlow(await searchParams);
  const session = await getServerSession();
  // This page serves one state; every other one is /onboarding's to route.
  if (!session || (oauth ? session.organizations.length === 0 : session.status !== "no-active-org"))
    redirect("/onboarding");

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold tracking-tight text-ink">Choose an organization</h1>
        <p className="text-sm text-ink-3 text-pretty">
          {oauth
            ? "Pick the organization this app will work in."
            : "You belong to more than one. Pick the one you want to work in — you can switch later."}
        </p>
      </div>
      <OrgPicker organizations={session.organizations} oauth={oauth} />
    </>
  );
}
