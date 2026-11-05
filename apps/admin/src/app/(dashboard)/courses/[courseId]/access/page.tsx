import { serverApi } from "@/lib/api/server";
import { requirePermission } from "@/lib/auth/server-permissions";
import { parseListParams } from "@/lib/table/parse-list-params";
import { AccessGrantsList } from "@/components/access-grants-list";
import { GrantAccessButton } from "@/components/grant-access-button";

import { CourseLearnersTable } from "./_components/course-learners-table";

export default async function CourseAccessTab({
  params,
  searchParams,
}: {
  params: Promise<{ courseId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { courseId } = await params;
  const { permissions } = await requirePermission(["access:read", "progress:read"], courseId);
  const canGrant = permissions.has("access:write") && permissions.has("people:read");

  if (permissions.has("progress:read", courseId)) {
    const listParams = parseListParams(await searchParams, { pageSize: 20, initialSort: [] });
    const [page, students, grants] = await Promise.all([
      serverApi.courseLearners(courseId, listParams),
      canGrant ? serverApi.studentsLite() : Promise.resolve([]),
      canGrant ? serverApi.contentEntitlements(courseId, false) : Promise.resolve([]),
    ]);
    const granted = new Set(grants.map((g) => g.orgUserId));

    return (
      <CourseLearnersTable
        courseId={courseId}
        rows={page.rows}
        total={page.total}
        params={listParams}
        grantCandidates={students.filter((s) => !granted.has(s.id))}
        canGrant={canGrant}
      />
    );
  }

  const [grants, students] = await Promise.all([
    serverApi.contentEntitlements(courseId, permissions.has("people:read")),
    canGrant ? serverApi.studentsLite() : Promise.resolve([]),
  ]);
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
