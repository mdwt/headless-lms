import { requireAuth } from "@/lib/auth/server-session";
import { serverApi } from "@/lib/api/server";

import { CourseBuilderView } from "./course-builder-view";

// Course builder page: fetches course + modules server-side, renders the builder.
export default async function CourseBuilderPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;

  // Start the data fetches immediately, await the session gate, then await them
  // — all API round-trips run in parallel instead of sequentially.
  const dataPromise = Promise.all([
    serverApi.getCourse(courseId),
    serverApi.listModules(courseId),
  ]);
  const session = await requireAuth(dataPromise);

  const [course, modules] = await dataPromise;

  return (
    <CourseBuilderView
      courseId={courseId}
      role={session.role}
      course={course}
      modules={modules}
    />
  );
}
