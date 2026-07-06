import * as React from "react";

import { requireAuth } from "@/lib/auth/server-session";
import { isManager } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";

import { SettingsNav } from "./settings-nav";

/**
 * Settings shell: a "Settings" heading over a two-column layout — a grouped
 * sub-nav (Organization / Account) on the left, the active panel on the right.
 * The Organization group is manager-only, so the role is resolved here and
 * passed to the client nav.
 */
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAuth();
  const manager = isManager(session.role);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Settings" />
      <div className="flex flex-col gap-8 lg:flex-row lg:gap-12">
        <aside className="lg:w-56 lg:shrink-0">
          <SettingsNav manager={manager} />
        </aside>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
