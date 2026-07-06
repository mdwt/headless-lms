import { requireAuth } from "@/lib/auth/server-session";
import { serverApi } from "@/lib/api/server";

import { ConnectedAppsView } from "./connected-apps-view";

// Connected apps list page: fetches server-side, renders the client view.
export default async function ConnectedAppsPage() {
  // Start the data fetch immediately, await the session gate, then await the
  // data — the two API round-trips run in parallel instead of sequentially.
  const dataPromise = serverApi.listConnectedApps();
  await requireAuth(dataPromise);
  const apps = await dataPromise;

  return <ConnectedAppsView apps={apps} />;
}
