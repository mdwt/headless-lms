import { requirePermission } from "@/lib/auth/server-permissions";
import { serverApi } from "@/lib/api/server";
import { parseListParams } from "@/lib/table/parse-list-params";

import { MembersTable } from "./members-table";

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { permissions } = await requirePermission("people:read");
  const sp = await searchParams;
  const params = parseListParams(sp, {
    pageSize: 10,
    initialSort: [{ id: "status", desc: false }],
  });

  const [{ rows, total }, roles, titles] = await Promise.all([
    serverApi.listMembers(params),
    permissions.has("roles:read") ? serverApi.listRoles() : Promise.resolve([]),
    serverApi.contentTitles(permissions),
  ]);

  return <MembersTable rows={rows} total={total} params={params} roles={roles} titles={titles} />;
}
