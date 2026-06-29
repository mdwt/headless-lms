"use client";

import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { useOverview } from "@/lib/api/hooks";
import { useCurrentUser, useOrganization } from "@/lib/auth/session-context";
import { can, isManager } from "@/lib/roles";
import type { OverviewStats } from "@/lib/api/types";

import { StatStrip, StatStripSkeleton, type Stat } from "./_components/stat-strip";
import { FocusPanel } from "./_components/focus-panel";

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
  { key: "activeEnrollments", label: "Active enrollments", managerOnly: true },
{ key: "expiringSoon", label: "Expiring soon", managerOnly: true },
];

export default function OverviewPage() {
  const user = useCurrentUser();
  const org = useOrganization();
  const manager = isManager(user.role);
  const { data, isLoading, isError, refetch } = useOverview();

  const firstName = user.name.trim().split(/\s+/)[0] ?? user.name;
  const visibleStatKeys = STAT_CONFIG.filter((s) => manager || !s.managerOnly);
  const skeletonCount = visibleStatKeys.length;

  const stats: Stat[] = data
    ? visibleStatKeys.map((s) => ({ label: s.label, value: data[s.key] }))
    : [];

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={`${greeting()}, ${firstName}`}
        description={
          manager
            ? `Here's what's happening across ${org.name} today.`
            : `Your teaching at ${org.name} at a glance.`
        }
        actions={
          can.createCourse(user) ? (
            <Button asChild variant="primary">
              <Link href="/courses">New course</Link>
            </Button>
          ) : undefined
        }
      />

      {isLoading ? (
        <Section>
          <StatStripSkeleton count={skeletonCount} />
        </Section>
      ) : isError || !data ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : (
        <Section>
          <StatStrip stats={stats} />

          {manager ? (
            <div className="@container">
              <div className="grid grid-cols-1 gap-4 @2xl:grid-cols-2">
                <FocusPanel
                  href="/enrollments"
                  title="Expiring soon"
                  description="Active enrollments lapsing within 30 days."
                  count={data.expiringSoon}
                />
              </div>
            </div>
          ) : null}
        </Section>
      )}
    </div>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-4">{children}</div>;
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-card border border-line bg-surface px-5 py-6">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-ink">Couldn&apos;t load your overview</p>
        <p className="max-w-[60ch] text-sm text-ink-3 text-pretty">
          Something went wrong fetching the latest numbers. Check your connection and try again.
        </p>
      </div>
      <Button variant="secondary" size="sm" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}
