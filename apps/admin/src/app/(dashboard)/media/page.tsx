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
  const sp = await searchParams;
  const params = parseListParams(sp, { pageSize: 24 });

  // Start the data fetch immediately, await the session gate, then await the
  // data — the two API round-trips run in parallel instead of sequentially.
  const dataPromise = serverApi.listAssets(params);
  const session = await getServerSession();
  if (!session) {
    void dataPromise.catch(() => {});
    redirect("/login");
  }
  const { rows, total } = await dataPromise;

  return <MediaView rows={rows} total={total} params={params} />;
}
