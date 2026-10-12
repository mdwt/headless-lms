import { serverApi } from "@/lib/api/server";
import { requireAuth } from "@/lib/auth/server-session";

import { ConnectedAppsView } from "./connected-apps-view";

export default async function ConnectedAppsPage() {
  const dataPromise = serverApi.listConnectedApps();
  await requireAuth(dataPromise);
  const apps = await dataPromise;

  return <ConnectedAppsView apps={apps} />;
}
