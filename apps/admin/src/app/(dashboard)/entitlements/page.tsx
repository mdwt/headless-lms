import { requireManager } from "@/lib/auth/server-session";
import { serverApi } from "@/lib/api/server";
import { parseListParams } from "@/lib/table/parse-list-params";

import { EntitlementsTable } from "./entitlements-table";

// Entitlements list page: reads URL params, fetches the page plus grant-form lookup lists server-side.
export default async function EntitlementsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const params = parseListParams(sp, {
    pageSize: 10,
    initialSort: [{ id: "grantedAt", desc: true }],
  });

  // Start the data fetches immediately, gate on session/role, then await them —
  // all API round-trips run in parallel instead of sequentially.
  const dataPromise = Promise.all([
    serverApi.listEntitlements(params),
    serverApi.studentsLite(),
    serverApi.coursesLite(),
  ]);
  await requireManager(dataPromise);
  const [{ rows, total }, students, courses] = await dataPromise;

  return (
    <EntitlementsTable
      rows={rows}
      total={total}
      params={params}
      students={students}
      courses={courses}
    />
  );
}
