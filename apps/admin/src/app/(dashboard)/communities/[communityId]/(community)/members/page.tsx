import { requirePermission } from "@/lib/auth/server-permissions";
import { serverApi } from "@/lib/api/server";
import { parseListParams } from "@/lib/table/parse-list-params";

import { CommunityMembersTable } from "./_components/community-members-table";

export default async function CommunityMembersTab({
  params,
  searchParams,
}: {
  params: Promise<{ communityId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { communityId } = await params;
  const listParams = parseListParams(await searchParams, { pageSize: 20, initialSort: [] });
  const { permissions } = await requirePermission("access:read");
  const canGrant = permissions.has("access:write") && permissions.has("people:read");
  const [page, students, grants] = await Promise.all([
    serverApi.communityMembers(communityId, listParams),
    canGrant ? serverApi.studentsLite() : Promise.resolve([]),
    canGrant ? serverApi.contentEntitlements(communityId) : Promise.resolve([]),
  ]);
  const holders = new Set(grants.filter((g) => g.status === "active").map((g) => g.orgUserId));

  return (
    <CommunityMembersTable
      communityId={communityId}
      rows={page.rows}
      total={page.total}
      params={listParams}
      grantCandidates={students.filter((s) => !holders.has(s.id))}
      canGrant={canGrant}
    />
  );
}
