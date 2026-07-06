import { notFound, redirect } from "next/navigation";

import { getServerSession } from "@/lib/auth/server-session";
import { serverApi } from "@/lib/api/server";
import { parseListParams } from "@/lib/table/parse-list-params";
import { isManager } from "@/lib/roles";

import { EntitlementsTable } from "./entitlements-table";

/**
 * Entitlements list — pure-RSC (option 2). The Server Component reads the URL
 * state, fetches the exact page from the API via the SDK (cookie-forwarded),
 * and hands the rows to the client island as PROPS. No react-query, no
 * HydrationBoundary: the server is the single source of truth. Navigating
 * (page/sort/filter/search changes the URL) re-runs THIS component and streams
 * new rows down; mutations are Server Actions that `revalidatePath`
 * ("/entitlements") — see `actions.ts`.
 *
 * The grant form's lookup selects are static option sources, so the student and
 * course lists are fetched here and passed straight to the island as props.
 */
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
  const session = await getServerSession();
  if (!session || !isManager(session.role)) {
    void dataPromise.catch(() => {});
    if (!session) redirect("/login");
    notFound();
  }
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
