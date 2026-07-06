import { redirect } from "next/navigation";

import { getServerSession } from "@/lib/auth/server-session";
import { serverApi } from "@/lib/api/server";

import { CourseBuilderView } from "./course-builder-view";

/**
 * Course Builder (detail) — pure-RSC (option 2). The Server Component resolves
 * the caller's role, fetches the course detail and its modules via the SDK
 * (cookie-forwarded), and hands both to the interactive (dnd-kit) client island
 * as PROPS. No react-query, no HydrationBoundary: the server is the single
 * source of truth. Writes are Server Actions that `revalidatePath` the builder
 * route (see `actions.ts`), which re-runs THIS component and streams fresh
 * course + modules back down. Drag-and-drop reordering stays client-optimistic.
 */
export default async function CourseBuilderPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;

  const session = await getServerSession();
  if (!session) redirect("/login");

  const [course, modules] = await Promise.all([
    serverApi.getCourse(courseId),
    serverApi.listModules(courseId),
  ]);

  return (
    <CourseBuilderView
      courseId={courseId}
      role={session.role}
      course={course}
      modules={modules}
    />
  );
}
