import { serverApi } from "@/lib/api/server";
import { getPermissions } from "@/lib/auth/server-permissions";
import { requireAuth } from "@/lib/auth/server-session";

import { ENROLLMENT_RANGES } from "./_components/enrollment-ranges";
import { OverviewView } from "./_components/overview-view";

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireAuth();
  const permissions = await getPermissions();

  const sp = await searchParams;
  const range = ENROLLMENT_RANGES.find((r) => r.key === sp.range) ?? ENROLLMENT_RANGES[1];

  const analytics = permissions.has("analytics:read");
  const [stats, enrollments] = analytics
    ? await Promise.all([serverApi.overview(), serverApi.enrollmentSeries(range.days)])
    : [null, null];

  return (
    <OverviewView
      user={session.user}
      organization={session.organization.name}
      stats={stats}
      enrollments={enrollments}
      range={range.key}
      canCreateCourse={permissions.has("courses:write")}
      canSeeAccess={permissions.has("access:read")}
      canSeeEvents={permissions.anywhere("events:read")}
      manages={permissions.manages}
    />
  );
}
