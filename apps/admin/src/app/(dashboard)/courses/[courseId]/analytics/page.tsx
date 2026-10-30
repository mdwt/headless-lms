import { serverApi } from "@/lib/api/server";
import { formatNumber } from "@/lib/format";

import { ENROLLMENT_RANGES } from "../../../_components/enrollment-ranges";
import { EnrollmentsChart } from "../../../_components/enrollments-chart";
import { ActivityEngagementTable } from "./_components/activity-engagement-table";
import { AnalyticsStats } from "./_components/analytics-stats";

// Analytics tab: completion + engagement for the course, computed against the
// currently enrolled cohort by the reporting/admin course read.
export default async function CourseAnalyticsTab({
  params,
  searchParams,
}: {
  params: Promise<{ courseId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { courseId } = await params;
  const sp = await searchParams;
  const range = ENROLLMENT_RANGES.find((r) => r.key === sp.range) ?? ENROLLMENT_RANGES[1];

  const [analytics, enrollments] = await Promise.all([
    serverApi.courseAnalytics(courseId),
    serverApi.courseEnrollmentSeries(courseId, range.days),
  ]);

  return (
    <section className="flex flex-col gap-8">
      <AnalyticsStats
        stats={[
          { label: "Enrolled", value: formatNumber(analytics.enrolled) },
          { label: "Started", value: formatNumber(analytics.started) },
          { label: "Completed", value: formatNumber(analytics.completed) },
          { label: "Avg. progress", value: `${analytics.avgProgress}%` },
        ]}
      />

      <EnrollmentsChart data={enrollments} range={range.key} />

      <ActivityEngagementTable activities={analytics.activities} enrolled={analytics.enrolled} />
    </section>
  );
}
