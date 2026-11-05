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
    const ids = permissions.where("communities:moderate").content;
    const homes = await Promise.all(
      ids.map((id) => serverApi.memberCommunityHome(id).catch(() => null)),
    );
    const communities = homes
      .filter((home) => home !== null)
      .map((home) => ({ id: home.communityId, title: home.title, spaceCount: home.spaces.length }));
    return <ModeratedCommunities communities={communities} />;
  }

  const params = parseListParams(await searchParams, {
    pageSize: 20,
    initialSort: [{ id: "updatedAt", desc: true }],
  });
  const { rows, total } = await serverApi.listCommunities(params);

  return <CommunitiesTable rows={rows} total={total} params={params} />;
}
