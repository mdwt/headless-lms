"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { authClient } from "@/lib/auth/client";
import { FullPageLoader } from "@/components/full-page-states";

/**
 * Client island rendered by the `(dashboard)` server layout when the resolved
 * session has status `no-active-org` (a member of at least one org, but none is
 * active on the session yet). The server can't set a cookie mid-render, so this
 * island activates the first org client-side — mirroring the old auto-activate
 * behavior — then `router.refresh()`es so the server session resolver re-runs
 * and renders the dashboard with the now-active org + role.
 */
export function OrgActivator() {
  const router = useRouter();
  const { data: orgs } = authClient.useListOrganizations();
  const done = React.useRef(false);

  React.useEffect(() => {
    if (done.current) return;
    if (orgs && orgs.length > 0) {
      done.current = true;
      void authClient.organization
        .setActive({ organizationId: orgs[0].id })
        .then(() => router.refresh())
        .catch(() => {
          done.current = false;
        });
    }
  }, [orgs, router]);

  return <FullPageLoader label="Preparing your workspace…" />;
}
