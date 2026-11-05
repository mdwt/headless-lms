import { requirePermission } from "@/lib/auth/server-permissions";
import { serverApi } from "@/lib/api/server";
import { parseListParams } from "@/lib/table/parse-list-params";

import { EntitlementsTable } from "./entitlements-table";

// Entitlements list page: reads URL params, fetches the page plus grant-form lookup lists server-side.
export default async function EntitlementsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { permissions } = await requirePermission("access:read");
  const canGrant = permissions.has("access:write") && permissions.has("people:read");
  const sp = await searchParams;
  const params = parseListParams(sp, {
    pageSize: 10,
    initialSort: [{ id: "grantedAt", desc: true }],
  });

  const [{ rows, total }, students, content] = await Promise.all([
    serverApi.listEntitlements(params),
    canGrant ? serverApi.studentsLite() : Promise.resolve([]),
    canGrant ? serverApi.contentLite() : Promise.resolve([]),
  ]);

  return (
    <EntitlementsTable
      rows={rows}
      total={total}
      params={params}
      students={students}
      content={content}
      canGrant={canGrant}
    />
  );
}
