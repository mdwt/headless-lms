import { serverApi } from "@/lib/api/server";
import { requirePermission } from "@/lib/auth/server-permissions";
import { parseListParams } from "@/lib/table/parse-list-params";

import { requestTime } from "./_lib/event-time";
import { EventsTable } from "./events-table";

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission("events:read");
  const sp = await searchParams;
  const params = parseListParams(sp, {
    pageSize: 20,
    initialSort: [{ id: "startsAt", desc: true }],
  });

  const { rows, total } = await serverApi.listEvents(params);

  return <EventsTable rows={rows} total={total} params={params} now={requestTime()} />;
}
