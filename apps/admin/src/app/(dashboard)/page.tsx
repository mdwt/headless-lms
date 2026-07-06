import { serverApi } from "@/lib/api/server";
import { requireAuth } from "@/lib/auth/server-session";

import { OverviewView } from "./_components/overview-view";

// Dashboard overview. `requireAuth` shares the layout's cached session (free)
// and redirects if unauthenticated; the layout has already handled the no-org
// states, so reaching here means an authenticated session with an active org —
// safe to fire the org-scoped stats.
export default async function OverviewPage() {
  const session = await requireAuth();

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
