import { serverApi } from "@/lib/api/server";
import { requirePermission } from "@/lib/auth/server-permissions";
import { parseListParams } from "@/lib/table/parse-list-params";

import { CommunitiesTable } from "./communities-table";
import { ModeratedCommunities } from "./_components/moderated-communities";

export default async function CommunitiesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { permissions } = await requirePermission(["communities:read", "communities:moderate"]);

  if (!permissions.anywhere("communities:read")) {
    const { rows } = await serverApi.listCommunities({
      page: 1,
      pageSize: 100,
      sort: [{ id: "title", desc: false }],
    });
    const membership = await Promise.all(rows.map((c) => serverApi.isCommunityMember(c.id)));
    const joined = rows.filter((_, i) => membership[i]);
    const spaces = await Promise.all(joined.map((c) => serverApi.communitySpaces(c.id)));
    const communities = joined.map((c, i) => ({
      id: c.id,
      title: c.title,
      spaceCount: spaces[i].length,
    }));
    return <ModeratedCommunities communities={communities} />;
  }

  const params = parseListParams(await searchParams, {
    pageSize: 20,
    initialSort: [{ id: "updatedAt", desc: true }],
  });
  const { rows, total } = await serverApi.listCommunities(params);

  return <CommunitiesTable rows={rows} total={total} params={params} />;
}
