import { notFound, redirect } from "next/navigation";

import { getServerSession } from "@/lib/auth/server-session";
import { serverApi } from "@/lib/api/server";
import { parseListParams } from "@/lib/table/parse-list-params";
import { isManager } from "@/lib/roles";

import { StudentsTable } from "./students-table";

/**
 * Students list — pure-RSC (option 2). The Server Component reads the URL state,
 * fetches the exact page from the API via the SDK (cookie-forwarded), and hands
 * the rows to the client island as PROPS. No react-query, no HydrationBoundary:
 * the server is the single source of truth. Navigating (page/sort/filter/search
 * changes the URL) re-runs THIS component and streams new rows down.
 *
 * The session/role is validated server-side (defense-in-depth; the client island
 * also renders ForbiddenView for non-managers): missing session → login, a
 * non-manager → 404.
 */
export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getServerSession();
  if (!session) redirect("/login");
  if (!isManager(session.role)) notFound();

  const sp = await searchParams;
  const params = parseListParams(sp, {
    pageSize: 10,
    initialSort: [{ id: "lastActiveAt", desc: true }],
  });

  const { rows, total } = await serverApi.listStudents(params);

  return <StudentsTable rows={rows} total={total} params={params} />;
}
