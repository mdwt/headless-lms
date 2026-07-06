import { redirect } from "next/navigation";

import { serverApi } from "@/lib/api/server";
import { getServerSession } from "@/lib/auth/server-session";

import { OverviewView } from "./_components/overview-view";

/**
 * Dashboard overview — pure-RSC (option 2). The Server Component resolves the
 * session, fetches the overview stats from the API via the SDK (cookie-
 * forwarded), and hands both to `OverviewView` as PROPS. No react-query, no
 * HydrationBoundary: the server is the single source of truth.
 */
export default async function OverviewPage() {
  const session = await getServerSession();
  if (!session || session.status !== "authenticated" || !session.organization) {
    redirect("/login");
  }

  const stats = await serverApi.overview();

  return (
    <OverviewView
      role={session.role}
      user={session.user}
      organization={session.organization}
      stats={stats}
    />
  );
}
