import { serverApi } from "@/lib/api/server";
import { requirePermission } from "@/lib/auth/server-permissions";
import { AccessGrantsList } from "@/components/access-grants-list";
import { GrantAccessButton } from "@/components/grant-access-button";

// Access tab: the students granted access to this course (entitlements), plus
// the course-scoped grant form.
export default async function CourseAccessTab({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  const { permissions } = await requirePermission(["access:read", "progress:read"], courseId);
  const canGrant = permissions.has("access:write") && permissions.has("people:read");

  const [grants, students] = await Promise.all([
    serverApi.contentEntitlements(courseId, permissions.has("people:read")),
    canGrant ? serverApi.studentsLite() : Promise.resolve([]),
  ]);

  // Anyone already on the list can't be granted twice — revoked grants are
  // reinstated from the Entitlements area, not re-granted here.
  const granted = new Set(grants.map((g) => g.orgUserId));
  const candidates = students.filter((s) => !granted.has(s.id));

  return (
    <AccessGrantsList
      grants={grants}
      emptyDescription="Students granted access to this course will appear here."
      action={
        canGrant ? (
          <GrantAccessButton contentId={courseId} contentNoun="course" students={candidates} />
        ) : undefined
      }
      emptyAction={
        canGrant ? (
          <GrantAccessButton
            contentId={courseId}
            contentNoun="course"
            students={candidates}
            variant="secondary"
          />
        ) : undefined
      }
    />
  );
}
