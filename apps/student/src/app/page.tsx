import { requireAuth } from "@/lib/auth/server-session";
import { learnApi } from "@/lib/api/server";
import { adaptCourseSummary } from "@/lib/adapt";
import { Dashboard } from "@/components/dashboard/dashboard";

export default async function Page() {
  const coursesPromise = learnApi.listCourses();
  const orgPromise = learnApi.org();
  const session = await requireAuth(coursesPromise, orgPromise);
  // Promise.all (not sequential awaits) so one read rejecting still marks the
  // other as handled — no unhandledRejection noise while the request unwinds.
  const [rawCourses, org] = await Promise.all([coursesPromise, orgPromise]);
  const courses = rawCourses.map(adaptCourseSummary);
  return <Dashboard courses={courses} studentName={session.user.name} orgName={org.name} />;
}
