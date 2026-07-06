import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import type { OverviewStats, SessionUser } from "@/lib/api/types";
import type { ServerRole } from "@/lib/auth/server-session";
import { can, isManager } from "@/lib/roles";

import { FocusPanel } from "./focus-panel";
import { StatStrip, type Stat } from "./stat-strip";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

const STAT_CONFIG: { key: keyof OverviewStats; label: string; managerOnly?: boolean }[] = [
  { key: "publishedCourses", label: "Published courses" },
  { key: "draftCourses", label: "Draft courses" },
  { key: "activeStudents", label: "Active students", managerOnly: true },
  { key: "activeEnrollments", label: "Active entitlements", managerOnly: true },
  { key: "expiringSoon", label: "Expiring soon", managerOnly: true },
];

interface OverviewViewProps {
  role: ServerRole;
  user: { id: string; name: string; email: string; image: string | null };
  organization: { id: string; name: string; slug: string };
  stats: OverviewStats;
}

/**
 * Overview page (option 2). Role/user/org and the overview stats are all
 * server-resolved and arrive as PROPS — no `useOverview`, no client query
 * cache. Purely presentational, so this is a Server Component.
 */
export function OverviewView({ role, user, organization, stats: overview }: OverviewViewProps) {
  const manager = isManager(role);

  // Rehydrate a SessionUser so the shared `can.*` gates stay the single source
  // of truth for capability checks (scoping is API-sourced; not wired → []).
  const sessionUser: SessionUser = { ...user, role, scopedCourseIds: [] };

  const firstName = user.name.trim().split(/\s+/)[0] ?? user.name;
  const visibleStatKeys = STAT_CONFIG.filter((s) => manager || !s.managerOnly);

  const stats: Stat[] = visibleStatKeys.map((s) => ({ label: s.label, value: overview[s.key] }));

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={`${greeting()}, ${firstName}`}
        description={
          manager
            ? `Here's what's happening across ${organization.name} today.`
            : `Your teaching at ${organization.name} at a glance.`
        }
        actions={
          can.createCourse(sessionUser) ? (
            <Button asChild variant="primary">
              <Link href="/courses">New course</Link>
            </Button>
          ) : undefined
        }
      />

      <Section>
        <StatStrip stats={stats} />

        {manager ? (
          <div className="@container">
            <div className="grid grid-cols-1 gap-4 @2xl:grid-cols-2">
              <FocusPanel
                href="/entitlements"
                title="Expiring soon"
                description="Active entitlements lapsing within 30 days."
                count={overview.expiringSoon}
              />
            </div>
          </div>
        ) : null}
      </Section>
    </div>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-4">{children}</div>;
}
