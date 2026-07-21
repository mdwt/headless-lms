import { requireAuth } from "@/lib/auth/server-session";
import { learnApi } from "@/lib/api/server";
import { adaptCourseSummary } from "@/lib/adapt";
import { Dashboard } from "@/components/dashboard/dashboard";

export default async function Page() {
  const coursesPromise = learnApi.listCourses();
  const session = await requireAuth(coursesPromise);
  const courses = (await coursesPromise).map(adaptCourseSummary);
  return <Dashboard courses={courses} studentName={session.user.name} />;
}
