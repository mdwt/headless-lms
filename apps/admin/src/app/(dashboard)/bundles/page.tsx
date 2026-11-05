import { serverApi } from "@/lib/api/server";
import { requirePermission } from "@/lib/auth/server-permissions";
import { parseListParams } from "@/lib/table/parse-list-params";

import { BundlesTable } from "./bundles-table";

// Bundles list page: reads URL params, fetches server-side, renders the table.
export default async function BundlesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { permissions } = await requirePermission("bundles:read");
  const sp = await searchParams;
  const params = parseListParams(sp, {
    pageSize: 20,
    initialSort: [{ id: "updatedAt", desc: true }],
  });

  const [{ rows, total }, content] = await Promise.all([
    serverApi.listBundles(params),
    permissions.has("bundles:write") ? serverApi.contentLite() : Promise.resolve([]),
  ]);

  // A bundle's contents are single items — bundles can't contain bundles.
  const bundleable = content.filter((c) => c.type !== "bundle");

  return <BundlesTable rows={rows} total={total} params={params} content={bundleable} />;
}
