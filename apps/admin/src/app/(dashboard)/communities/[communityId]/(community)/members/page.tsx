import { requireAuth } from "@/lib/auth/server-session";
import { serverApi } from "@/lib/api/server";
import { isManager } from "@/lib/roles";
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
  const pagePromise = serverApi.communityMembers(communityId, listParams);
  const session = await requireAuth(pagePromise);
  const manager = isManager(session.role);
  const [page, students, grants] = await Promise.all([
    pagePromise,
    manager ? serverApi.studentsLite() : Promise.resolve([]),
    manager ? serverApi.contentEntitlements(communityId) : Promise.resolve([]),
  ]);
  const holders = new Set(grants.filter((g) => g.status === "active").map((g) => g.orgUserId));

  return (
    <CommunityMembersTable
      communityId={communityId}
      rows={page.rows}
      total={page.total}
      params={listParams}
      grantCandidates={students.filter((s) => !holders.has(s.id))}
    />
  );
}
