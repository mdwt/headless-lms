import { serverApi } from "@/lib/api/server";
import { requirePermission } from "@/lib/auth/server-permissions";
import { formatNumber } from "@/lib/format";

import { AnalyticsStats } from "../../../courses/[courseId]/analytics/_components/analytics-stats";
import { cumulativeGrants } from "../../_lib/event-time";
import { GrantsChart } from "../_components/grants-chart";

export default async function EventAnalyticsTab({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  await requirePermission("events:read", eventId);

  const [event, analytics] = await Promise.all([
    serverApi.getEvent(eventId),
    serverApi.eventAnalytics(eventId),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const start = event.startsAt.slice(0, 10);
  const grants = cumulativeGrants(analytics.grantsOverTime, start < today ? start : today);

  const filled =
    analytics.capacity === null
      ? "No limit"
      : `${Math.round((analytics.attendees / analytics.capacity) * 100)}%`;

  return (
    <section className="flex flex-col gap-10">
      <AnalyticsStats
        stats={[
          { label: "Attendees", value: formatNumber(analytics.attendees) },
          { label: "Capacity filled", value: filled },
          { label: "Revoked", value: formatNumber(analytics.revoked) },
        ]}
      />

      <div className="flex flex-col gap-4">
        <h2 className="text-sm font-medium text-ink">By source</h2>
        <AnalyticsStats
          stats={[
            { label: "Registered", value: formatNumber(analytics.bySource.self) },
            { label: "Added", value: formatNumber(analytics.bySource.manual) },
            { label: "Automation", value: formatNumber(analytics.bySource.automation) },
            { label: "Bundle", value: formatNumber(analytics.bySource.bundle) },
          ]}
        />
      </div>

      <GrantsChart data={grants} />
    </section>
  );
}
