import * as React from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getServerSession } from "@/lib/auth/server-session";
import { canAccessDashboard } from "@/lib/roles";
import { SessionProvider } from "@/lib/auth/session-context";
import { CreateOrganization } from "@/lib/auth/create-organization";
import { OrgActivator } from "@/lib/auth/org-activator";
import { AppShell } from "@/components/app-shell/app-shell";

// Title reflects the active organization rather than a hardcoded brand. Reuses
// the request-cached session resolution, so this adds no extra fetch. Falls back
// to a neutral title before an org is resolved.
export async function generateMetadata(): Promise<Metadata> {
  const session = await getServerSession();
  const org = session?.organization?.name?.trim();
  return { title: org ? `${org} - headless-lms` : "headless-lms" };
}

// Server-side auth gate for the back office. Gate states: no session → /login,
// denied (valid cookie, no staff role — e.g. a student login) → /login?denied=1
// where the login page force-signs-out, no-organization → org creation,
// no-active-org → org activator, else app shell.
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession();
  if (!session) redirect("/login");
  if (session.status === "denied") redirect("/login?denied=1");
  if (session.status === "no-organization") return <CreateOrganization />;
  if (session.status === "no-active-org") return <OrgActivator />;
  // Defense-in-depth role seam (all org roles currently pass).
  if (!canAccessDashboard(session.role)) redirect("/login?denied=1");

  return (
    <SessionProvider session={session}>
      <AppShell user={session.user} organization={session.organization!} role={session.role}>
        {children}
      </AppShell>
    </SessionProvider>
  );
}
