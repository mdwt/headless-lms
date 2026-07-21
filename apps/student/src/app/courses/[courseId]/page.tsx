import { notFound } from "next/navigation";

import { requireAuth } from "@/lib/auth/server-session";
import { learnApi } from "@/lib/api/server";
import { adaptCourse } from "@/lib/adapt";
import { CoursePlayer } from "@/components/player/course-player";

export default async function CoursePlayerPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  const session = await requireAuth();
  const [course, modules] = await Promise.all([
    learnApi.getCourse(courseId),
    learnApi.listModules(courseId),
  ]);
  if (!course || !modules) notFound();
  return <CoursePlayer course={adaptCourse(course, modules)} studentName={session.user.name} />;
}
