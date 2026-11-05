import type { ReactNode } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getServerSession } from "@/lib/auth/server-session";
import { getMyPermissions } from "@/lib/auth/server-permissions";
import { PermissionsProvider } from "@/lib/auth/permissions-context";
import { SessionProvider } from "@/lib/auth/session-context";
import { AppShell } from "@/components/app-shell/app-shell";

// Title reflects the active organization rather than a hardcoded brand. Reuses
// the request-cached session resolution, so this adds no extra fetch. Falls back
// to a neutral title before an org is resolved.
export async function generateMetadata(): Promise<Metadata> {
  const session = await getServerSession();
  const org = session?.organization?.name?.trim();
  return { title: org ? `${org} - headless-lms` : "headless-lms" };
}

// Server-side auth gate for the back office. Two outcomes only: no session at
// all goes to /login, and anything short of a resolved active org goes to
// /onboarding, which decides whether to route the user or reset them.
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession();
  if (!session) redirect("/login");
  if (session.status !== "authenticated") redirect("/onboarding");
  const permissions = await getMyPermissions();

  return (
    <SessionProvider session={session}>
      <PermissionsProvider permissions={permissions}>
        <AppShell user={session.user} organization={session.organization!}>
          {children}
        </AppShell>
      </PermissionsProvider>
    </SessionProvider>
  );
}
