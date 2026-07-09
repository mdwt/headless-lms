import { redirect } from "next/navigation";

// The bare course URL has no content of its own — send it to the default tab.
export default async function CourseIndex({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  redirect(`/courses/${courseId}/details`);
}
