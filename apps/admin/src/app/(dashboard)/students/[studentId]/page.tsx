import { serverApi } from "@/lib/api/server";
import { requirePermission } from "@/lib/auth/server-permissions";

import { StudentDetailView } from "./student-detail-view";

/**
 * Student detail — pure-RSC (option 2). The Server Component gates on
 * `people:read`, fetches the student and their entitlements from the API via the
 * SDK (cookie-forwarded), and hands them to the client view as PROPS. No
 * react-query, no HydrationBoundary. A missing student surfaces as a 404 thrown
 * by the SDK, so we let it propagate.
 */
export default async function StudentDetailPage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const { studentId } = await params;
  const { permissions } = await requirePermission("people:read");
  const canSeeAccess = permissions.has("access:read");
  const canGrant = permissions.has("access:write");

  const [student, entitlements, content, analytics] = await Promise.all([
    serverApi.getStudent(studentId),
    canSeeAccess ? serverApi.studentEntitlements(studentId) : Promise.resolve([]),
    canGrant ? serverApi.contentLite(permissions) : Promise.resolve([]),
    serverApi.studentAnalytics(studentId),
  ]);

  return (
    <StudentDetailView
      student={student}
      entitlements={entitlements}
      content={content}
      analytics={analytics}
    />
  );
}
