import * as React from "react";
import { redirect } from "next/navigation";

import { getServerSession } from "@/lib/auth/server-session";
import { canAccessDashboard } from "@/lib/roles";
import { SessionProvider } from "@/lib/auth/session-context";
import { CreateOrganization } from "@/lib/auth/create-organization";
import { OrgActivator } from "@/lib/auth/org-activator";
import { AppShell } from "@/components/app-shell/app-shell";

/**
 * Server-first auth gate for the entire back office. The session/org/role is
 * resolved on the server (cookie forwarded to the API), so there is no client
 * loading flash and no client-side session stitching.
 *
 * - No session → `/login` (belt-and-suspenders with the edge middleware).
 * - `no-organization` → org-creation client island.
 * - `no-active-org` → org-activator client island (sets active, refreshes).
 * - `authenticated` → app shell + a thin client `SessionProvider` seeded with
 *   the server-resolved `{ user, organization, role }`.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession();
  if (!session) redirect("/login");
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
