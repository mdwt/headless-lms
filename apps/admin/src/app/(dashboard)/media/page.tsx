import { requireAuth } from "@/lib/auth/server-session";
import { serverApi } from "@/lib/api/server";
import { parseListParams } from "@/lib/table/parse-list-params";

import { MediaView } from "./media-view";

// Media library page: reads URL params, fetches server-side, renders the media view.
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
  await requireAuth(dataPromise);
  const { rows, total } = await dataPromise;

  return <MediaView rows={rows} total={total} params={params} />;
}
