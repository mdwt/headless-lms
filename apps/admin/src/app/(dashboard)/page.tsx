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
  // Resolve the session BEFORE fetching. The overview endpoint is org-scoped and
  // 403s ("no active organization in session") for a user without an active org
  // — the exact state a freshly signed-up user is in. The `(dashboard)` layout
  // already gates those states (no session → /login, no-organization →
  // CreateOrganization, no-active-org → OrgActivator) and renders its own UI
  // instead of this page, so here we simply render nothing and never fire the
  // doomed request. `getServerSession` is React.cache'd, so this is free (the
  // layout already resolved it) — no round-trip is lost by not parallelizing.
  const session = await getServerSession();
  if (!session || session.status !== "authenticated" || !session.organization) {
    return null;
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
