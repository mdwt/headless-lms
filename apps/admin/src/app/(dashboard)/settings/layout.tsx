import type { ReactNode } from "react";

import { requireAuth } from "@/lib/auth/server-session";
import { PageHeader } from "@/components/page-header";

import { SettingsNav } from "./settings-nav";

/**
 * Settings shell: a "Settings" heading over a two-column layout — a grouped
 * sub-nav (Organization / Account) on the left, the active panel on the right.
 * Each panel shows by its own permission, read in the client nav.
 */
export default async function SettingsLayout({ children }: { children: ReactNode }) {
  await requireAuth();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Settings" />
      <div className="flex flex-col gap-8 lg:flex-row lg:gap-12">
        <aside className="lg:w-56 lg:shrink-0">
          <SettingsNav />
        </aside>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
