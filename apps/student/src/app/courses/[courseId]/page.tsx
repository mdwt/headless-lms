import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { requireAuth } from "@/lib/auth/server-session";
import { learnApi } from "@/lib/api/server";
import { resolveAssetUrls } from "@/lib/api/resolve-asset-urls";
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
  const [course, modules, org, progress] = await Promise.all([
    learnApi.getCourse(courseId),
    learnApi.listModules(courseId),
    learnApi.org(),
    learnApi.courseProgress(courseId),
  ]);
  if (!course || !modules) notFound();

  const adapted = adaptCourse(course, modules);
  // Where the student left off: the first activity in course order they
  // haven't completed.
  const completion = progress?.activities ?? {};
  const lessons = adapted.modules.flatMap((m) => m.lessons);
  const resumeLessonId = (lessons.find((l) => completion[l.id] !== "completed") ?? lessons[0])?.id;
  // Render each activity's Plate content on the server so the client player
  // receives ready-made nodes (no client re-execution → no hydration mismatch).
  // Stored media URLs are upload-time presigns (long expired) — mint fresh
  // short-lived ones for this render before handing the config to the renderer.
  const renderedContent: Record<string, ReactNode> = {};
  for (const mod of adapted.modules) {
    for (const lesson of mod.lessons) {
      const content = lesson.content
        ? { ...lesson.content, config: await resolveAssetUrls(lesson.content.config) }
        : null;
      renderedContent[lesson.id] = renderActivityContent(content);
    }
  }

  return (
    <CoursePlayer
      course={adapted}
      studentName={session.user.name}
      orgName={org.name}
      renderedContent={renderedContent}
      initialCompletion={completion}
      initialPositions={progress?.positions ?? {}}
      initialLessonId={resumeLessonId}
    />
  );
}
