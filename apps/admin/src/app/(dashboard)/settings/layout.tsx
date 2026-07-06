import * as React from "react";

import { requireAuth } from "@/lib/auth/server-session";
import { isManager } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";

import { SettingsTabs } from "./settings-tabs";

/**
 * Settings shell: a single "Settings" heading with a route-based tab bar. Team,
 * Apps, and Account each render as a tab panel below. The Team tab is
 * manager-only, so the role is resolved here and passed to the client tabs.
 */
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAuth();
  const manager = isManager(session.role);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Settings" />
      <SettingsTabs manager={manager} />
      <div>{children}</div>
    </div>
  );
}
