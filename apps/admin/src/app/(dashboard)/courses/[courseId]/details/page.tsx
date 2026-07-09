import { requireAuth } from "@/lib/auth/server-session";
import { serverApi } from "@/lib/api/server";

import { CourseDetailsForm } from "../_components/course-details-form";

// Details tab: edit course metadata (title, category, description).
export default async function CourseDetailsTab({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;

  const coursePromise = serverApi.getCourse(courseId);
  await requireAuth(coursePromise);
  const course = await coursePromise;

  return <CourseDetailsForm course={course} />;
}
