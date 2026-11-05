import { ItemRolesSection } from "@/components/item-roles-section";

export default async function CoursePeopleTab({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  return <ItemRolesSection contentId={courseId} contentType="course" contentNoun="course" />;
}
