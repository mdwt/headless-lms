import type { ReactNode } from "react";
import { requirePermission } from "@/lib/auth/server-permissions";
import { serverApi } from "@/lib/api/server";
import { CourseHeader } from "./_components/course-header";

export default async function CourseLayout({
  params,
  children,
}: {
  params: Promise<{ courseId: string }>;
  children: ReactNode;
}) {
  const { courseId } = await params;

  await requirePermission("courses:read", courseId);
  const course = await serverApi.getCourse(courseId);

  return (
    <div className="flex flex-col gap-8">
      <CourseHeader course={course} />
      {children}
    </div>
  );
}
