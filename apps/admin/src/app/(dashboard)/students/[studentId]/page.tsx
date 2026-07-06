import { serverApi } from "@/lib/api/server";
import { requireManager } from "@/lib/auth/server-session";

import { StudentDetailView } from "./student-detail-view";

/**
 * Student detail — pure-RSC (option 2). The Server Component validates the
 * session/role, fetches the student and their entitlements from the API via the
 * SDK (cookie-forwarded), and hands them to the client view as PROPS. No
 * react-query, no HydrationBoundary. A missing student surfaces as a 404 from
 * the API `unwrap`, so we let it propagate.
 */
export default async function StudentDetailPage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const { studentId } = await params;

  // Start the data fetches immediately, gate on session/role, then await them —
  // all API round-trips run in parallel instead of sequentially.
  const dataPromise = Promise.all([
    serverApi.getStudent(studentId),
    serverApi.studentEntitlements(studentId),
  ]);
  await requireManager(dataPromise);
  const [student, entitlements] = await dataPromise;

  return <StudentDetailView student={student} entitlements={entitlements} />;
}
