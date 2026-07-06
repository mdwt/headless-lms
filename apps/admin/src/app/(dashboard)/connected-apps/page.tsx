import { redirect } from "next/navigation";

import { getServerSession } from "@/lib/auth/server-session";
import { serverApi } from "@/lib/api/server";

import { ConnectedAppsView } from "./connected-apps-view";

/**
 * Connected apps list — pure-RSC (option 2). The Server Component fetches the
 * apps from the API via the SDK (cookie-forwarded) and hands them to the client
 * island as PROPS. No react-query, no HydrationBoundary: the server is the
 * single source of truth. The revoke mutation is a Server Action that
 * `revalidatePath("/connected-apps")` (see `actions.ts`), which re-runs THIS
 * component and streams the fresh list down.
 */
export default async function ConnectedAppsPage() {
  // Start the data fetch immediately, await the session gate, then await the
  // data — the two API round-trips run in parallel instead of sequentially.
  const dataPromise = serverApi.listConnectedApps();
  const session = await getServerSession();
  if (!session) {
    void dataPromise.catch(() => {});
    redirect("/login");
  }
  const apps = await dataPromise;

  return <ConnectedAppsView apps={apps} />;
}
