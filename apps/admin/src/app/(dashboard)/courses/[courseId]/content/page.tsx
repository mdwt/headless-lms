import { serverApi } from "@/lib/api/server";
import { requirePermission } from "@/lib/auth/server-permissions";

import { ModuleList } from "../_components/module-list";

// Content tab: the course curriculum (modules + activities). Holders of
// `courses:write` on the course may edit.
export default async function CourseContentTab({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  const { permissions } = await requirePermission("courses:read", courseId);

  const modules = await serverApi.moduleTree(courseId);

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-ink-2">Curriculum</h2>
      <ModuleList
        courseId={courseId}
        modules={modules}
        canEdit={permissions.has("courses:write", courseId)}
      />
    </section>
  );
}
