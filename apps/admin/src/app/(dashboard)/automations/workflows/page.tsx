import { requirePermission } from "@/lib/auth/server-permissions";
import { serverApi } from "@/lib/api/server";
import { parseListParams } from "@/lib/table/parse-list-params";

import { AutomationsTable } from "./automations-table";
import { shapeAutomationsList } from "./list-utils";

// Workflows list page. The list endpoint returns the org's full set (no
// server pagination), so search/facets/sort/slice are applied here, in the
// RSC, off the same URL params every other list uses.
export default async function WorkflowsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const params = parseListParams(sp, {
    pageSize: 10,
    initialSort: [{ id: "name", desc: false }],
  });

  await requirePermission("automations:read");

  const dataPromise = Promise.all([
    serverApi.listAutomations("workflow"),
    serverApi.automationTriggers(),
  ]);
  const [all, triggers] = await dataPromise;
  const { rows, total } = shapeAutomationsList(all, params);

  return <AutomationsTable rows={rows} total={total} params={params} triggers={triggers} />;
}
