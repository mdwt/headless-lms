"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { useDashboardSession } from "@/lib/auth/client";
import { SessionProvider } from "@/lib/auth/session-context";
import { canAccessDashboard } from "@/lib/roles";
import { AppShell } from "@/components/app-shell/app-shell";
import { FullPageLoader } from "@/components/full-page-states";
import { CreateOrganization } from "./_components/create-organization";

/**
 * Auth gate for the entire back office. Unauthenticated users → /login.
 * Students have no dashboard access → bounced to /login. A signed-in user with
 * no organization is offered an org-creation step. Everyone else gets the shell
 * with their resolved session (user + active org + role) in context.
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useDashboardSession();
  const router = useRouter();

  React.useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    } else if (status === "authenticated" && session && !canAccessDashboard(session.user.role)) {
      router.replace("/login?denied=1");
    }
  }, [status, session, router]);

  if (status === "no-organization") return <CreateOrganization />;

  if (status !== "authenticated" || !session) return <FullPageLoader />;
  if (!canAccessDashboard(session.user.role)) return <FullPageLoader label="Redirecting…" />;

  return (
    <SessionProvider session={session}>
      <AppShell session={session}>{children}</AppShell>
    </SessionProvider>
  );
}
