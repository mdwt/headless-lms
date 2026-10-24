import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { requireAuth } from "@/lib/auth/server-session";
import { memberApi } from "@/lib/api/server";
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
  const [course, modules, activities, org, viewer, progress] = await Promise.all([
    memberApi.getCourse(courseId),
    memberApi.listModules(courseId),
    memberApi.listActivities(courseId),
    memberApi.org(),
    memberApi.viewer(),
    memberApi.courseProgress(courseId),
  ]);
  if (!course || !modules || !activities) notFound();

  const adapted = adaptCourse(course, modules, activities);
  // Where the student left off: the first activity in course order they
  // haven't completed.
  const completion = progress?.activities ?? {};
  const lessons = adapted.modules.flatMap((m) => m.lessons);
  const resumeLessonId = (lessons.find((l) => completion[l.id] !== "completed") ?? lessons[0])?.id;
  // Render each activity's Plate content on the server so the client player
  // receives ready-made nodes (no client re-execution → no hydration mismatch).
  // Media nodes take their URLs from the activity's `assetUrls`, served with it.
  const renderedContent: Record<string, ReactNode> = {};
  for (const mod of adapted.modules) {
    for (const lesson of mod.lessons) {
      renderedContent[lesson.id] = renderActivityContent(lesson.content ?? null, lesson.assetUrls);
    }
  }

  return (
    <CoursePlayer
      course={adapted}
      studentName={session.user.name}
      orgUserId={viewer.orgUserId}
      orgName={org.name}
      renderedContent={renderedContent}
      initialCompletion={completion}
      initialPositions={progress?.positions ?? {}}
      initialLessonId={resumeLessonId}
    />
  );
}
