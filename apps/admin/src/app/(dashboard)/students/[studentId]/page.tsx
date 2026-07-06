import { notFound, redirect } from "next/navigation";

import { serverApi } from "@/lib/api/server";
import { getServerSession } from "@/lib/auth/server-session";
import { isManager } from "@/lib/roles";

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
  const session = await getServerSession();
  if (!session) redirect("/login");
  if (!isManager(session.role)) notFound();

  const { studentId } = await params;

  const [student, entitlements] = await Promise.all([
    serverApi.getStudent(studentId),
    serverApi.studentEntitlements(studentId),
  ]);

  return <StudentDetailView student={student} entitlements={entitlements} />;
}
