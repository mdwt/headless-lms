import { redirect } from "next/navigation";

import { getServerSession } from "@/lib/auth/server-session";
import { serverApi } from "@/lib/api/server";
import { parseListParams } from "@/lib/table/parse-list-params";

import { MediaView } from "./media-view";

/**
 * Media library — pure-RSC (option 2). The Server Component reads the URL state,
 * fetches the exact page from the API via the SDK (cookie-forwarded), and hands
 * the rows to the client island as PROPS. No react-query, no HydrationBoundary:
 * the server is the single source of truth. Navigating (page/search/kind filter
 * changes the URL) re-runs THIS component and streams new rows down.
 *
 * The irreducibly browser-only flows stay client-side: presigned preview URLs
 * (brokered by `getAssetUrlAction`) and the direct-to-storage upload PUT (XHR
 * with progress, between `requestUploadAction` and `confirmAssetAction`). All
 * mutations `revalidatePath("/media")` so the next render streams fresh rows.
 */
export default async function MediaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getServerSession();
  if (!session) redirect("/login");

  const sp = await searchParams;
  const params = parseListParams(sp, { pageSize: 24 });

  const { rows, total } = await serverApi.listAssets(params);

  return <MediaView rows={rows} total={total} params={params} />;
}
