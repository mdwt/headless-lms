// Settings tab: every course-level setting, one section per group.
import { serverApi } from "@/lib/api/server";
import { courseSettingsOf } from "@/lib/api/compose";
import { SettingsSurface } from "@/components/forms/settings-section";

import { BasicsForm } from "./_components/basics-form";
import { ThumbnailField } from "./_components/thumbnail-field";
import { CommentsSettings } from "./_components/comments-settings";
import { CourseSettingsForm } from "../_components/course-settings-form";

export default async function CourseSettingsTab({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;

  const course = await serverApi.getCourse(courseId);

  return (
    <SettingsSurface>
      <BasicsForm course={course} />
      <ThumbnailField
        courseId={course.id}
        assetId={course.thumbnailAssetId}
        url={course.thumbnailUrl}
      />
      <CommentsSettings courseId={course.id} settings={courseSettingsOf(course).comments} />
      <CourseSettingsForm course={course} />
    </SettingsSurface>
  );
}
