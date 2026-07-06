import { requireManager } from "@/lib/auth/server-session";
import { serverApi } from "@/lib/api/server";
import { parseListParams } from "@/lib/table/parse-list-params";

import { MembersTable } from "./members-table";

// Members list page (manager-only): reads URL params, fetches server-side, renders the table.
export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const params = parseListParams(sp, {
    pageSize: 10,
    initialSort: [{ id: "status", desc: false }],
  });

  // Start the data fetch immediately, gate on session/role, then await it — the
  // two API round-trips run in parallel instead of sequentially.
  const dataPromise = serverApi.listMembers(params);
  await requireManager(dataPromise);
  const { rows, total } = await dataPromise;

  return <MembersTable rows={rows} total={total} params={params} />;
}
