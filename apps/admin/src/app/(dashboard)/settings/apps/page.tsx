import { serverApi } from "@/lib/api/server";
import { requirePermission } from "@/lib/auth/server-permissions";
import { parseListParams } from "@/lib/table/parse-list-params";

import { AppsTable } from "./apps-table";
import { shapeAppsList } from "./list-utils";

export default async function AppsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission("organizations:read");
  const sp = await searchParams;
  const params = parseListParams(sp, {
    pageSize: 10,
    initialSort: [{ id: "name", desc: false }],
  });

  const apps = await serverApi.listApps();
  const { rows, total } = shapeAppsList(apps, params);

  return <AppsTable rows={rows} total={total} params={params} apps={apps} />;
}
