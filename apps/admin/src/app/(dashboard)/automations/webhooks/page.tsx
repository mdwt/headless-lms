import { requireManager } from "@/lib/auth/server-session";
import { serverApi } from "@/lib/api/server";
import { parseListParams } from "@/lib/table/parse-list-params";

import { WebhooksTable } from "./webhooks-table";
import { shapeWebhooksList } from "./list-utils";

export default async function WebhooksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const params = parseListParams(sp, {
    pageSize: 10,
    initialSort: [{ id: "url", desc: false }],
  });

  const dataPromise = Promise.all([serverApi.listWebhooks(), serverApi.automationTriggers()]);
  await requireManager(dataPromise);
  const [all, triggers] = await dataPromise;
  const { rows, total } = shapeWebhooksList(all, params);

  return <WebhooksTable rows={rows} total={total} params={params} triggers={triggers} />;
}
