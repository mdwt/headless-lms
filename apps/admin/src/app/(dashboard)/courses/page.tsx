import { requireAuth } from "@/lib/auth/server-session";
import { serverApi } from "@/lib/api/server";
import { parseListParams } from "@/lib/table/parse-list-params";

import { CoursesTable } from "./courses-table";

// Courses list page: reads URL params, fetches server-side, renders the table.
export default async function CoursesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const params = parseListParams(sp, {
    pageSize: 20,
    initialSort: [{ id: "updatedAt", desc: true }],
  });

  // Start the data fetch immediately, await the session gate, then await the
  // data. The fetch only needs the forwarded cookie (not the session result),
  // so the two API round-trips run in parallel instead of sequentially.
  const dataPromise = serverApi.listCourses(params);
  await requireAuth(dataPromise);
  const { rows, total } = await dataPromise;

  return <CoursesTable rows={rows} total={total} params={params} />;
}
