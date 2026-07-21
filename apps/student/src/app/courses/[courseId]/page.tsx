import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { requireAuth } from "@/lib/auth/server-session";
import { learnApi } from "@/lib/api/server";
import { adaptCourse } from "@/lib/adapt";
import { renderActivityContent } from "@/components/player/content/render-activity";
import { CoursePlayer } from "@/components/player/course-player";

export default async function CoursePlayerPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  const session = await requireAuth();
  const [course, modules, org] = await Promise.all([
    learnApi.getCourse(courseId),
    learnApi.listModules(courseId),
    learnApi.org(),
  ]);
  if (!course || !modules) notFound();

  const adapted = adaptCourse(course, modules);
  // Render each activity's Plate content on the server so the client player
  // receives ready-made nodes (no client re-execution → no hydration mismatch).
  const renderedContent: Record<string, ReactNode> = {};
  for (const mod of adapted.modules) {
    for (const lesson of mod.lessons) {
      renderedContent[lesson.id] = renderActivityContent(lesson.content);
    }
  }

  return (
    <CoursePlayer
      course={adapted}
      studentName={session.user.name}
      orgName={org.name}
      renderedContent={renderedContent}
    />
  );
}
