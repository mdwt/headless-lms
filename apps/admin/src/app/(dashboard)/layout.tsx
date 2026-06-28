"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { useSession } from "@/lib/auth/client";
import { SessionProvider } from "@/lib/auth/session-context";
import { canAccessDashboard } from "@/lib/roles";
import { AppShell } from "@/components/app-shell/app-shell";
import { FullPageLoader } from "@/components/full-page-states";

/**
 * Auth gate for the entire back office. Unauthenticated users → /login.
 * Students have no dashboard access → bounced to /login too. Everyone else
 * gets the shell with their session in context.
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { data: session, isPending } = useSession();
  const router = useRouter();

  React.useEffect(() => {
    if (isPending) return;
    if (!session) {
      router.replace("/login");
    } else if (!canAccessDashboard(session.user.role)) {
      router.replace("/login?denied=1");
    }
  }, [isPending, session, router]);

  if (isPending) return <FullPageLoader />;
  if (!session || !canAccessDashboard(session.user.role)) return <FullPageLoader label="Redirecting…" />;

  return (
    <SessionProvider session={session}>
      <AppShell session={session}>{children}</AppShell>
    </SessionProvider>
  );
}
