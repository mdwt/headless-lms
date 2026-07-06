import { redirect, notFound } from "next/navigation";

import { getServerSession } from "@/lib/auth/server-session";
import { serverApi } from "@/lib/api/server";
import { parseListParams } from "@/lib/table/parse-list-params";
import { isManager } from "@/lib/roles";

import { MembersTable } from "./members-table";

/**
 * Members list — pure-RSC (option 2). The Server Component reads the URL state,
 * fetches the exact page from the API via the SDK (cookie-forwarded), and hands
 * the rows to the client island as PROPS. No react-query, no HydrationBoundary:
 * the server is the single source of truth. Navigating (page/sort/filter/search
 * changes the URL) re-runs THIS component and streams new rows down; mutations
 * are Server Actions that `revalidatePath("/members")` (see `actions.ts`).
 *
 * Manager-only (owner|admin): non-managers are bounced with `notFound()` here
 * (server gate), and the island still renders `ForbiddenView` as defense in depth.
 */
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
  const session = await getServerSession();
  if (!session || !isManager(session.role)) {
    void dataPromise.catch(() => {});
    if (!session) redirect("/login");
    notFound();
  }
  const { rows, total } = await dataPromise;

  return <MembersTable rows={rows} total={total} params={params} />;
}
