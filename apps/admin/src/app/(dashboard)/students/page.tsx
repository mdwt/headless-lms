import { requireManager } from "@/lib/auth/server-session";
import { serverApi } from "@/lib/api/server";
import { parseListParams } from "@/lib/table/parse-list-params";

import { StudentsTable } from "./students-table";

// Students list page (manager-only): reads URL params, fetches server-side, renders the table.
export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const params = parseListParams(sp, {
    pageSize: 10,
    initialSort: [{ id: "lastActiveAt", desc: true }],
  });

  // Start the data fetch immediately, gate on session/role, then await it — the
  // two API round-trips run in parallel instead of sequentially.
  const dataPromise = serverApi.listStudents(params);
  await requireManager(dataPromise);
  const { rows, total } = await dataPromise;

  return <StudentsTable rows={rows} total={total} params={params} />;
}
