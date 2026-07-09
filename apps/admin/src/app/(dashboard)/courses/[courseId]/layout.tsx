import { requireAuth } from "@/lib/auth/server-session";
import { isManager } from "@/lib/roles";
import { serverApi } from "@/lib/api/server";
import { ForbiddenView } from "@/components/full-page-states";

import { CourseHeader } from "./_components/course-header";

// Shared shell for a single course: back link, header, and the tab nav. Each tab
// is its own route segment (content / details / analytics / access) rendered as
// `children`. Managers only — instructor course scoping isn't wired yet.
export default async function CourseLayout({
  params,
  children,
}: {
  params: Promise<{ courseId: string }>;
  children: React.ReactNode;
}) {
  const { courseId } = await params;

  const coursePromise = serverApi.getCourse(courseId);
  const session = await requireAuth(coursePromise);
  if (!isManager(session.role)) {
    void coursePromise.catch(() => {});
    return <ForbiddenView description="You don't have access to manage this course." />;
  }
  const course = await coursePromise;

  return (
    <div className="flex flex-col gap-8">
      <CourseHeader course={course} />
      {children}
    </div>
  );
}
