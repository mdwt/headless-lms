import { serverApi } from "@/lib/api/server";
import { parseListParams } from "@/lib/table/parse-list-params";

import { CommunitiesTable } from "./communities-table";

export default async function CommunitiesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = parseListParams(await searchParams, {
    pageSize: 20,
    initialSort: [{ id: "updatedAt", desc: true }],
  });
  const { rows, total } = await serverApi.listCommunities(params);

  return <CommunitiesTable rows={rows} total={total} params={params} />;
}
