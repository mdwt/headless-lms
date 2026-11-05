import { requirePermission } from "@/lib/auth/server-permissions";
import { serverApi } from "@/lib/api/server";
import { parseListParams } from "@/lib/table/parse-list-params";

import { DeliveriesTable } from "./_components/deliveries-table";

export default async function WebhookDeliveriesPage({
  params,
  searchParams,
}: {
  params: Promise<{ webhookId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ webhookId }, sp] = await Promise.all([params, searchParams]);
  const listParams = parseListParams(sp, {
    pageSize: 20,
    initialSort: [{ id: "startedAt", desc: true }],
  });

  await requirePermission("automations:read");

  const dataPromise = Promise.all([
    serverApi.listAutomationRuns(webhookId, listParams),
    serverApi.automationTriggers(),
  ]);
  const [page, triggers] = await dataPromise;

  return (
    <DeliveriesTable
      webhookId={webhookId}
      rows={page.rows}
      total={page.total}
      params={listParams}
      triggers={triggers}
    />
  );
}
