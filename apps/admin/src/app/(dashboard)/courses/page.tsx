import { redirect } from "next/navigation";

import { getServerSession } from "@/lib/auth/server-session";
import { serverApi } from "@/lib/api/server";
import { parseListParams } from "@/lib/table/parse-list-params";

import { CoursesTable } from "./courses-table";

/**
 * Courses list — pure-RSC (option 2). The Server Component reads the URL state,
 * fetches the exact page from the API via the SDK (cookie-forwarded), and hands
 * the rows to the client island as PROPS. No react-query, no HydrationBoundary:
 * the server is the single source of truth. Navigating (page/sort/filter/search
 * changes the URL) re-runs THIS component and streams new rows down; mutations
 * are Server Actions that `revalidatePath("/courses")` (see `actions.ts`).
 *
 * Contrast the react-query version in git history: there, this file prefetched
 * into a QueryClient and wrapped the island in `<HydrationBoundary>`, and the
 * island fetched with `useCourses`. Here it's a plain `await` + props.
 */
export default async function CoursesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const params = parseListParams(sp, {
    pageSize: 10,
    initialSort: [{ id: "updatedAt", desc: true }],
  });

  // Start the data fetch immediately, await the session gate, then await the
  // data. The fetch only needs the forwarded cookie (not the session result),
  // so the two API round-trips run in parallel instead of sequentially.
  const dataPromise = serverApi.listCourses(params);
  const session = await getServerSession();
  if (!session) {
    void dataPromise.catch(() => {}); // discard the in-flight fetch on redirect
    redirect("/login");
  }
  const { rows, total } = await dataPromise;

  return <CoursesTable rows={rows} total={total} params={params} />;
}
