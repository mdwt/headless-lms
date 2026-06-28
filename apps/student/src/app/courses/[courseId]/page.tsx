import { CoursePlayer } from "@/components/player/course-player";

export default async function CoursePlayerPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  return <CoursePlayer courseId={courseId} />;
}
