import type { ReactNode } from "react";
import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/data-table/states";
import type { EnrollmentSeries, OverviewStats } from "@/lib/api/types";

import { type EnrollmentRangeKey } from "./enrollment-ranges";
import { EnrollmentsChart } from "./enrollments-chart";
import { FocusPanel } from "./focus-panel";
import { StatStrip, type Stat } from "./stat-strip";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

const STAT_CONFIG: { key: keyof OverviewStats; label: string }[] = [
  { key: "publishedCourses", label: "Published courses" },
  { key: "draftCourses", label: "Draft courses" },
  { key: "activeStudents", label: "Active students" },
  { key: "expiringSoon", label: "Expiring soon" },
  { key: "upcomingEvents", label: "Upcoming events" },
];

interface OverviewViewProps {
  user: { id: string; name: string; email: string; image: string | null };
  organization: string;
  stats: OverviewStats | null;
  enrollments: EnrollmentSeries | null;
  range: EnrollmentRangeKey;
  canCreateCourse: boolean;
  canSeeAccess: boolean;
  canSeeEvents: boolean;
  manages: boolean;
}

export function OverviewView({
  user,
  organization,
  stats: overview,
  enrollments,
  range,
  canCreateCourse,
  canSeeAccess,
  canSeeEvents,
  manages,
}: OverviewViewProps) {
  const firstName = user.name.trim().split(/\s+/)[0] ?? user.name;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={`${greeting()}, ${firstName}`}
        actions={
          canCreateCourse ? (
            <Button asChild variant="primary">
              <Link href="/courses">New course</Link>
            </Button>
          ) : undefined
        }
      />

      {overview ? (
        <Section>
          <StatStrip
            stats={STAT_CONFIG.map((s): Stat => ({ label: s.label, value: overview[s.key] }))}
          />

          {enrollments ? <EnrollmentsChart data={enrollments} range={range} /> : null}

          {canSeeAccess || canSeeEvents ? (
            <div className="@container">
              <div className="grid grid-cols-1 gap-4 @2xl:grid-cols-2">
                {canSeeAccess ? (
                  <FocusPanel
                    href="/entitlements"
                    title="Expiring soon"
                    description="Active entitlements lapsing within 30 days."
                    count={overview.expiringSoon}
                  />
                ) : null}
                {canSeeEvents ? (
                  <FocusPanel
                    href="/events?f_startsAt=upcoming&f_status=published"
                    title="Upcoming events"
                    description="Published events that haven't ended."
                    count={overview.upcomingEvents}
                  />
                ) : null}
              </div>
            </div>
          ) : null}
        </Section>
      ) : manages ? (
        <EmptyState
          title="No overview to show"
          description="The org's reports aren't part of what you manage. Use the menu to open what you can work on."
        />
      ) : (
        <EmptyState
          title="Nothing to manage yet"
          description={`You're a member of ${organization}. When you're given a role, what it lets you manage shows up here.`}
        />
      )}
    </div>
  );
}

function Section({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-8">{children}</div>;
}
