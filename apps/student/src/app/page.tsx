import { requireAuth } from "@/lib/auth/server-session";
import { learnApi } from "@/lib/api/server";
import { adaptCourseSummary } from "@/lib/adapt";
import { Dashboard } from "@/components/dashboard/dashboard";

export default async function Page() {
  const coursesPromise = learnApi.listCourses();
  const orgPromise = learnApi.org();
  const session = await requireAuth(coursesPromise);
  const courses = (await coursesPromise).map(adaptCourseSummary);
  const org = await orgPromise;
  return <Dashboard courses={courses} studentName={session.user.name} orgName={org.name} />;
}
